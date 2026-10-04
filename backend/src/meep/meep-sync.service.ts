import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { MeepClientService } from './meep-client.service';
import { MeepProductSalesSyncService } from './meep-product-sales-sync.service';
import { businessDayKey, businessDayStartUtc, businessDayEndUtc } from '../common/business-day.util';

// Sincroniza as vendas da Meep pra dentro do banco, respeitando as
// restrições de cada rota (documentadas no meep-client.service.ts). Nunca
// reconsulta um período já processado com sucesso — cada credencial guarda
// o cursor de até onde já foi (lastSalesSyncedUntil /
// lastConciliationSyncedUntil em MeepCredential).
//
// Três rotinas independentes, cada uma no seu próprio ritmo:
//  - syncSimpleSales: roda toda hora, janela de até 3 dias, traz pagamento
//    detalhado (crédito/débito/dinheiro/etc) por pedido.
//  - syncSales: só roda entre 04h-14h (restrição da própria Meep), janela
//    de até 3 dias, é a única que traz CFOP/NCM por item.
//  - syncConciliation: roda toda hora, janela de até 24h, alimenta a
//    conciliação de caixa por tipo de pagamento.
@Injectable()
export class MeepSyncService {
    private readonly logger = new Logger(MeepSyncService.name);

    constructor(
        private prisma: PrismaService,
        private meepClient: MeepClientService,
        private meepProductSalesSync: MeepProductSalesSyncService,
    ) { }

    // Serializa as rotinas que gravam pedidos/itens da MESMA loja. Sem
    // isso, o cron horário, a confirmação D+1, o GetSales das 04h-14h e os
    // botões manuais ("Sincronizar agora", "Rebuscar este dia") podiam
    // rodar ao mesmo tempo no mesmo pedido: ambos faziam deleteMany +
    // createMany dos itens, e como não há unique em (orderId, meepItemId)
    // o intercalar dos dois deixava os itens DUPLICADOS (inflando Itens
    // por Dia e Venda/Lista). Fila em memória por loja — o backend roda em
    // uma instância só, então isso basta.
    private readonly storeLocks = new Map<string, Promise<unknown>>();

    private runExclusive<T>(storeId: string, fn: () => Promise<T>): Promise<T> {
        const anterior = this.storeLocks.get(storeId) ?? Promise.resolve();
        const atual = anterior.catch(() => undefined).then(fn);
        const marcador = atual.catch(() => undefined);
        this.storeLocks.set(storeId, marcador);
        void marcador.then(() => {
            if (this.storeLocks.get(storeId) === marcador) this.storeLocks.delete(storeId);
        });
        return atual;
    }

    forceResync(storeId: string, credentialId: string, from: Date, to: Date) {
        return this.runExclusive(storeId, () => this.forceResyncLocked(storeId, credentialId, from, to));
    }

    syncSimpleSales(storeId: string, credentialId: string, cursorFrom: Date | null) {
        return this.runExclusive(storeId, () => this.syncSimpleSalesLocked(storeId, credentialId, cursorFrom));
    }

    syncSales(storeId: string, credentialId: string, cursorFrom: Date | null) {
        return this.runExclusive(storeId, () => this.syncSalesLocked(storeId, credentialId, cursorFrom));
    }

    // Falha de rebuild do Venda/Lista não derruba o sync (os pedidos já
    // foram gravados), mas NÃO pode ficar só num logger: vira linha no
    // Histórico de Sincronização (success=false) pra aparecer na tela.
    private async logRebuildErrors(storeId: string, rangeStart: Date, rangeEnd: Date, erros: string[]) {
        if (erros.length === 0) return;
        try {
            await this.log({
                storeId,
                endpoint: 'PRODUCT_SALES_REBUILD',
                rangeStart,
                rangeEnd,
                success: false,
                message: `Venda/Lista NÃO foi atualizado em ${erros.length} dia(s): ${erros.slice(0, 5).join(' | ')}`,
            });
        } catch (logError: any) {
            this.logger.error(`Não consegui gravar o log de falha do rebuild: ${logError?.message}`);
        }
    }

    private async activeCredentials() {
        return this.prisma.meepCredential.findMany({
            where: { active: true },
        });
    }

    private async log(params: {
        storeId: string;
        endpoint: string;
        rangeStart: Date;
        rangeEnd: Date;
        success: boolean;
        message: string;
        ordersFetched?: number;
        transactionsFetched?: number;
    }) {
        await this.prisma.meepSyncLog.create({
            data: {
                storeId: params.storeId,
                endpoint: params.endpoint,
                rangeStart: params.rangeStart,
                rangeEnd: params.rangeEnd,
                success: params.success,
                message: params.message,
                ordersFetched: params.ordersFetched ?? 0,
                transactionsFetched: params.transactionsFetched ?? 0,
            },
        });
    }

    // Grava (ou atualiza) um pedido Meep + seus itens/pagamentos. Os
    // filhos são sempre recriados do zero a cada sync — mais simples que
    // tentar diff, e o rawJson garante que nada se perde mesmo assim.
    private async upsertOrder(storeId: string, order: any, source: 'SALES' | 'SIMPLE_SALES') {
        const meepOrderId = order.OrderId;
        if (!meepOrderId) return;

        // GetSimpleSales e GetSales (confirmado na doc oficial da Meep) NÃO
        // têm o mesmo formato de resposta — nomes de campo diferentes pra
        // basicamente tudo (data, cliente, status, PDV, valor). Os
        // fallbacks abaixo tentam os dois formatos, nessa ordem, pra nunca
        // sobrescrever um campo que já veio certo de uma rota com null só
        // porque a outra rota chama o campo de outro jeito.
        const dataPedido = order.OrderDateUtc ?? order.Date;
        const valorPedido = order.Total ?? order.Value;
        const posCodePedido = order.PointOfSale?.PointOfSale ?? order.POS?.Code;

        // A Meep manda o código numérico do status tanto em `StatusCode`
        // quanto (na rota GetSales) só em `Status` — e o nome/descrição,
        // quando vem, em `StatusName`. Nosso `statusCode` é Int e `status`
        // é String; sem isso, um pedido com `Status: 3, StatusCode: null,
        // StatusName: null` (comum na rota GetSales) tentava gravar o
        // número 3 no campo String `status` e o Prisma rejeitava a
        // operação inteira (upsert falhava, pedido nunca era salvo).
        const statusCodePedido =
            order.StatusCode ?? (typeof order.Status === 'number' ? order.Status : null);
        const statusNomePedido =
            order.StatusName ?? (typeof order.Status === 'string' ? order.Status : null);

        // Mesma história pro caixa: GetSales manda `Cashier` como objeto
        // ({ CashierId, Start, End }), não como string — nosso campo
        // `cashierId` é String, então precisa extrair só o id.
        const cashierIdPedido =
            typeof order.Cashier === 'string'
                ? order.Cashier
                : order.Cashier?.CashierId ?? order.CashierId ?? null;

        const clienteDocumento = order.Customer?.CustomerDocument ?? order.Customer?.Document;
        const clienteNome = order.Customer?.CustomerName ?? order.Customer?.Name;
        const clienteEmail = order.Customer?.CustomerEmail ?? order.Customer?.Email;
        const clienteTelefone = order.Customer?.CustomerPhoneNumber ?? order.Customer?.PhoneNumber;
        const clienteIdentificador = order.Customer?.CustomerIdentifier ?? order.Customer?.Identificador;

        // GetSales (CFOP/NCM) e GetSimpleSales têm formatos bem diferentes
        // (ver comentário acima) e nenhum dos dois manda TODOS os campos —
        // GetSales por exemplo não manda StatusName nem PaymentType. Como
        // esse upsert roda alternadamente pelas duas rotas pro MESMO
        // pedido, um `update` incondicional (campo ?? null) fazia a
        // sincronização de CFOP (SALES, 4h-14h) APAGAR o status/forma de
        // pagamento que o sync horário de SIMPLE_SALES já tinha preenchido
        // certinho antes — e vice-versa. Por isso aqui só entra no
        // `update` o que essa chamada realmente trouxe; campo que essa
        // rota não manda (fica null) simplesmente não é tocado, mantendo o
        // que já estava salvo de uma sincronização anterior da outra rota.
        const camposCondicionais: Record<string, any> = {};
        if (statusCodePedido !== null) camposCondicionais.statusCode = statusCodePedido;
        if (statusNomePedido !== null) camposCondicionais.status = statusNomePedido;
        if (order.PaymentType !== undefined && order.PaymentType !== null) camposCondicionais.paymentType = order.PaymentType;
        if (posCodePedido !== undefined && posCodePedido !== null) camposCondicionais.posCode = posCodePedido;
        if (cashierIdPedido !== null) camposCondicionais.cashierId = cashierIdPedido;
        if (clienteDocumento !== undefined && clienteDocumento !== null) camposCondicionais.customerDocument = clienteDocumento;
        if (clienteNome !== undefined && clienteNome !== null) camposCondicionais.customerName = clienteNome;
        if (clienteEmail !== undefined && clienteEmail !== null) camposCondicionais.customerEmail = clienteEmail;
        if (clienteTelefone !== undefined && clienteTelefone !== null) camposCondicionais.customerPhoneNumber = clienteTelefone;
        if (clienteIdentificador !== undefined && clienteIdentificador !== null) camposCondicionais.customerIdentifier = clienteIdentificador;

        const orderRecord = await this.prisma.meepOrder.upsert({
            where: { storeId_meepOrderId: { storeId, meepOrderId } },
            update: {
                meepAccountId: order.AccountId ?? null,
                orderDateUtc: dataPedido ? new Date(dataPedido) : new Date(),
                discount: order.Discount ?? 0,
                value: valorPedido ?? 0,
                lastSyncedFrom: source,
                rawJson: order,
                ...camposCondicionais,
            },
            create: {
                storeId,
                meepOrderId,
                meepAccountId: order.AccountId ?? null,
                orderDateUtc: dataPedido ? new Date(dataPedido) : new Date(),
                statusCode: statusCodePedido,
                status: statusNomePedido,
                customerDocument: clienteDocumento ?? null,
                customerName: clienteNome ?? null,
                customerEmail: clienteEmail ?? null,
                customerPhoneNumber: clienteTelefone ?? null,
                customerIdentifier: clienteIdentificador ?? null,
                paymentType: order.PaymentType ?? null,
                posCode: posCodePedido ?? null,
                cashierId: cashierIdPedido,
                discount: order.Discount ?? 0,
                value: valorPedido ?? 0,
                lastSyncedFrom: source,
                rawJson: order,
            },
        });

        const items = Array.isArray(order.Itens) ? order.Itens : [];
        const payments = Array.isArray(order.Payments) ? order.Payments : [];

        // Itens só são regravados quando o source é GetSales (tem
        // CFOP/NCM) ou quando ainda não existe nenhum item salvo — assim
        // uma atualização vinda do GetSimpleSales não apaga o CFOP que já
        // tinha sido trazido antes pelo GetSales.
        const existingItemsCount = await this.prisma.meepOrderItem.count({
            where: { orderId: orderRecord.id },
        });

        if (source === 'SALES' || existingItemsCount === 0) {
            await this.prisma.meepOrderItem.deleteMany({ where: { orderId: orderRecord.id } });

            if (items.length > 0) {
                await this.prisma.meepOrderItem.createMany({
                    data: items.map((item: any) => ({
                        orderId: orderRecord.id,
                        meepItemId: item.Id ?? null,
                        productId: item.ProductId ?? '',
                        // GetSimpleSales chama de "Nome"/"Value", GetSales
                        // (confirmado na doc oficial) chama de
                        // "ProductName"/"UnitValue" e o NCM vem todo
                        // maiúsculo ("NCM", não "Ncm") — sem esse fallback,
                        // os itens vindos do GetSales entravam com nome
                        // vazio e NCM sempre null.
                        productName: item.Nome ?? item.ProductName ?? '',
                        quantity: item.Quantity ?? 0,
                        unitValue: item.Value ?? item.UnitValue ?? 0,
                        discount: item.Discount ?? 0,
                        addition: item.Addition ?? 0,
                        insurance: item.Insurance ?? 0,
                        total: item.Total ?? null,
                        ncm: item.NCM ?? item.Ncm ?? null,
                        cfop: item.Cfop ?? null,
                    })),
                });
            }
        }

        // Pagamentos só vêm detalhados no GetSimpleSales.
        if (source === 'SIMPLE_SALES' && payments.length > 0) {
            await this.prisma.meepOrderPayment.deleteMany({ where: { orderId: orderRecord.id } });

            await this.prisma.meepOrderPayment.createMany({
                data: payments.map((payment: any) => ({
                    orderId: orderRecord.id,
                    meepPaymentId: payment.Id ?? null,
                    typeId: payment.TypeId ?? null,
                    type: payment.Type ?? null,
                    value: payment.Value ?? 0,
                    receiptDate: payment.ReceiptDate ? new Date(payment.ReceiptDate) : null,
                    nsu: payment.Nsu ?? null,
                    authorizationNumber: payment.AuthorizationNumber ?? null,
                    cardBannerName: payment.CardBannerName ?? null,
                })),
            });
        }
    }

    // Descoberto na prática (não documentado pela Meep): GetSimpleSales/
    // GetSales truncam silenciosamente perto de ~104-110 registros por
    // chamada — e isso não depende do tamanho da janela pedida (uma
    // janela de 6h e uma de 3h no mesmo horário de pico vieram com o
    // MESMO número, 104, confirmado manualmente). O campo NextPage não
    // avisa (fica false mesmo truncado) e o parâmetro Page não pagina de
    // verdade (pedir "página 2" devolve os mesmos pedidos da página 1).
    // Ou seja: não é "pedir uma janela menor" que resolve — é um teto de
    // QUANTIDADE por chamada. A defesa aqui é adaptativa: se uma
    // sub-janela vier perto do teto, ela é dividida ao meio e cada
    // metade é buscada de novo, recursivamente, até ficar comprovadamente
    // abaixo do teto ou até bater numa janela mínima (não dá pra dividir
    // pra sempre). upsertOrder é idempotente por meepOrderId, então
    // buscar a mesma janela mais de uma vez (quando divide) não duplica
    // nada no banco.
    private static readonly SUB_WINDOW_HOURS = 3; // tamanho inicial de cada pedaço
    private static readonly MIN_WINDOW_MINUTES = 20; // não divide além disso
    private static readonly SUSPICIOUS_ORDER_COUNT = 95; // gatilho pra dividir (teto observado ~104-110)

    // Varre [start, end) em pedaços de SUB_WINDOW_HOURS, chamando
    // `fetchPage` pra cada um e gravando os pedidos via upsertOrder.
    // Quando um pedaço vem perto do teto observado, divide ele ao meio e
    // busca cada metade recursivamente (ver comentário acima).
    private async fetchOrdersInSubWindows(
        storeId: string,
        start: Date,
        end: Date,
        source: 'SALES' | 'SIMPLE_SALES',
        fetchPage: (subStart: Date, subEnd: Date) => Promise<{ orders: any[] }>,
    ): Promise<{ totalOrders: number; subWindows: number; suspiciousWindows: number }> {
        const uniqueOrderIds = new Set<string>();
        let subWindows = 0;
        let suspiciousWindows = 0;

        const fetchWindow = async (subStart: Date, subEnd: Date): Promise<void> => {
            const result = await fetchPage(subStart, subEnd);
            subWindows += 1;

            for (const order of result.orders) {
                if (order?.OrderId) uniqueOrderIds.add(order.OrderId);
                await this.upsertOrder(storeId, order, source);
            }

            const durationMinutes = (subEnd.getTime() - subStart.getTime()) / 60000;
            const canSplit = durationMinutes > MeepSyncService.MIN_WINDOW_MINUTES * 2;

            if (result.orders.length >= MeepSyncService.SUSPICIOUS_ORDER_COUNT) {
                suspiciousWindows += 1;

                if (canSplit) {
                    this.logger.warn(
                        `Sub-janela ${subStart.toISOString()}–${subEnd.toISOString()} da loja ${storeId} (${source}) veio com ${result.orders.length} pedido(s) — perto do teto da Meep, dividindo ao meio e rebuscando.`,
                    );

                    const mid = new Date((subStart.getTime() + subEnd.getTime()) / 2);

                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    await fetchWindow(subStart, mid);
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    await fetchWindow(mid, subEnd);
                } else {
                    this.logger.warn(
                        `Sub-janela ${subStart.toISOString()}–${subEnd.toISOString()} da loja ${storeId} (${source}) veio com ${result.orders.length} pedido(s) e já está na janela mínima (${MeepSyncService.MIN_WINDOW_MINUTES}min) — pode estar truncada mesmo assim, mas não dá pra dividir mais.`,
                    );
                }
            }
        };

        let cursor = new Date(start);
        const subWindowMs = MeepSyncService.SUB_WINDOW_HOURS * 60 * 60 * 1000;

        while (cursor < end) {
            const subEnd = new Date(Math.min(cursor.getTime() + subWindowMs, end.getTime()));

            await fetchWindow(cursor, subEnd);

            cursor = subEnd;

            if (cursor < end) {
                // Pausa entre chamadas pelo mesmo motivo da pausa entre
                // endpoints do cron (bot anti-abuso que a Meep menciona).
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }

        return { totalOrders: uniqueOrderIds.size, subWindows, suspiciousWindows };
    }

    // Re-sincronização forçada de um período já coberto pelo cursor —
    // criada pra corrigir um problema real: até 30/09 à noite, a versão
    // em produção ainda não tinha a defesa de sub-janelas (fetchOrdersInSubWindows)
    // contra o truncamento silencioso da Meep (~104-110 pedidos por
    // chamada, não importa o tamanho da janela pedida). Então todo
    // período sincronizado ANTES desse deploy pode estar com pedidos
    // faltando em dias de movimento forte (um dia com 400+ pedidos virava
    // só ~110 no banco, sem erro nenhum). upsertOrder é idempotente por
    // meepOrderId, então rebuscar o mesmo período com a versão corrigida
    // só preenche o que faltava, sem duplicar nada.
    //
    // Diferente do syncSimpleSales normal: aqui o período é escolhido por
    // quem chama (não parte do cursor), varre em pedaços de até 3 dias até
    // cobrir [from, to) inteiro numa chamada só, e no final also atualiza
    // o Venda/Lista (rebuildRange) pros dias tocados — já que o objetivo é
    // corrigir o passado, não só avançar o normal de agora em diante.
    private async forceResyncLocked(storeId: string, credentialId: string, from: Date, to: Date) {
        const now = new Date();
        const end = to > now ? now : to;

        if (end <= from) {
            return { totalOrders: 0, chunks: 0 };
        }

        let totalOrders = 0;
        let chunks = 0;
        let cursor = new Date(from);
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

        while (cursor < end) {
            const chunkEnd = new Date(Math.min(cursor.getTime() + threeDaysMs, end.getTime()));

            try {
                const { totalOrders: chunkOrders, subWindows, suspiciousWindows } =
                    await this.fetchOrdersInSubWindows(
                        storeId,
                        cursor,
                        chunkEnd,
                        'SIMPLE_SALES',
                        (subStart, subEnd) => this.meepClient.getSimpleSales(storeId, subStart, subEnd),
                    );

                totalOrders += chunkOrders;
                chunks += 1;

                await this.log({
                    storeId,
                    endpoint: 'SIMPLE_SALES',
                    rangeStart: cursor,
                    rangeEnd: chunkEnd,
                    success: true,
                    message: `OK (re-sincronização forçada) - ${chunkOrders} pedido(s) em ${subWindows} sub-janela(s)${suspiciousWindows > 0 ? ` (${suspiciousWindows} perto do teto — ver log de warning)` : ''}.`,
                    ordersFetched: chunkOrders,
                });
            } catch (error: any) {
                await this.log({
                    storeId,
                    endpoint: 'SIMPLE_SALES',
                    rangeStart: cursor,
                    rangeEnd: chunkEnd,
                    success: false,
                    message: `Re-sincronização forçada falhou: ${error?.message || String(error)}`,
                });
                this.logger.warn(
                    `Falha na re-sincronização forçada da loja ${storeId} (${cursor.toISOString()}–${chunkEnd.toISOString()}): ${error?.message}`,
                );
            }

            cursor = chunkEnd;

            if (cursor < end) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }

        // Não deixa o cursor normal pra trás: se o período corrigido
        // alcança (ou passa) onde o cursor já estava, avança ele também —
        // assim o hourlySync não refaz esse trabalho na próxima hora.
        const credential = await this.prisma.meepCredential.findUnique({
            where: { id: credentialId },
            select: { lastSalesSyncedUntil: true },
        });

        if (!credential?.lastSalesSyncedUntil || credential.lastSalesSyncedUntil < end) {
            await this.prisma.meepCredential.update({
                where: { id: credentialId },
                data: { lastSalesSyncedUntil: end },
            });
        }

        let rebuildErros: string[] = [];
        try {
            const rebuild = await this.meepProductSalesSync.rebuildRange(storeId, from, end);
            rebuildErros = rebuild.erros;
            await this.logRebuildErrors(storeId, from, end, rebuild.erros);
        } catch (bridgeError: any) {
            rebuildErros = [bridgeError?.message || String(bridgeError)];
            this.logger.error(
                `Falha ao atualizar Venda/Lista após re-sincronização forçada (loja ${storeId}): ${bridgeError?.message}`,
                bridgeError?.stack,
            );
            await this.logRebuildErrors(storeId, from, end, rebuildErros);
        }

        return { totalOrders, chunks, rebuildErros };
    }

    // Confirmação D+1: a Meep não fecha os dados de um dia comercial na
    // hora — pedidos continuam chegando/atualizando por algum tempo depois
    // da virada. Em vez de confiar só no cursor horário normal (que avança
    // cedo demais e pode deixar pedido de madrugada de fora), essa rotina
    // força uma nova busca do dia comercial de ONTEM inteiro, de manhã
    // (depois do horário em que a própria Meep já mostra tudo fechado no
    // painel dela), e marca o dia como "confirmado" — é esse campo que o
    // Venda/Lista usa pra decidir se mostra "Aguardando informação" ou o
    // número final. Reaproveita forceResync (mesma defesa contra
    // truncamento, mesmo rebuild do Venda/Lista no final).
    async confirmYesterday(storeId: string, credentialId: string) {
        const now = new Date();
        const referenciaOntem = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const dia = businessDayKey(referenciaOntem);
        const start = businessDayStartUtc(dia);
        const end = businessDayEndUtc(dia);

        await this.forceResync(storeId, credentialId, start, end);

        const credential = await this.prisma.meepCredential.findUnique({
            where: { id: credentialId },
            select: { lastDailyConfirmedBusinessDay: true },
        });

        // Só avança (nunca deixa um dia mais recente ser "desconfirmado"
        // por engano se essa rotina rodar fora de ordem por algum motivo).
        if (!credential?.lastDailyConfirmedBusinessDay || credential.lastDailyConfirmedBusinessDay < dia) {
            await this.prisma.meepCredential.update({
                where: { id: credentialId },
                data: { lastDailyConfirmedBusinessDay: dia },
            });
        }

        return { dia };
    }

    // Roda 3x seguidas (com intervalo) toda manhã, depois do horário em que
    // os dados de ontem já estão fechados na própria Meep (definido junto
    // com o usuário) — repetir algumas vezes é uma rede de segurança barata
    // contra uma falha pontual de rede/token numa única tentativa isolada.
    // confirmYesterday é idempotente (mesma defesa de upsert por
    // meepOrderId do forceResync), então rodar 3x não duplica nada.
    @Cron('10 8 * * *', { timeZone: 'America/Sao_Paulo' })
    async dailyConfirmSyncManha1() {
        await this.runDailyConfirmSync();
    }

    @Cron('40 8 * * *', { timeZone: 'America/Sao_Paulo' })
    async dailyConfirmSyncManha2() {
        await this.runDailyConfirmSync();
    }

    @Cron('10 9 * * *', { timeZone: 'America/Sao_Paulo' })
    async dailyConfirmSyncManha3() {
        await this.runDailyConfirmSync();
    }

    private async runDailyConfirmSync() {
        const credentials = await this.activeCredentials();

        for (const credential of credentials) {
            try {
                const { dia } = await this.confirmYesterday(credential.storeId, credential.id);
                this.logger.log(`Confirmação D+1 (loja ${credential.storeId}): dia ${dia} rebuscado e marcado como confirmado.`);
            } catch (error: any) {
                this.logger.warn(`Falha na confirmação D+1 da loja ${credential.storeId}: ${error?.message}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    // Sincroniza GetSimpleSales em janelas de até 3 dias, desde o cursor
    // salvo até agora. Roda a cada hora (ver @Cron abaixo). Internamente
    // quebra a janela em pedaços de SUB_WINDOW_HOURS (ver
    // fetchOrdersInSubWindows) pra não esbarrar no truncamento silencioso
    // da Meep.
    private async syncSimpleSalesLocked(storeId: string, credentialId: string, cursorFrom: Date | null) {
        const now = new Date();
        const start = cursorFrom ?? new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        // Nunca busca mais que 3 dias de uma vez (limite da rota) — se o
        // cursor está muito atrasado, avança em pedaços e só marca o
        // cursor como "em dia" quando realmente chegou perto de agora.
        const chunkEnd = new Date(Math.min(start.getTime() + 3 * 24 * 60 * 60 * 1000, now.getTime()));

        if (chunkEnd <= start) return;

        try {
            const { totalOrders, subWindows, suspiciousWindows } = await this.fetchOrdersInSubWindows(
                storeId,
                start,
                chunkEnd,
                'SIMPLE_SALES',
                (subStart, subEnd) => this.meepClient.getSimpleSales(storeId, subStart, subEnd),
            );

            await this.prisma.meepCredential.update({
                where: { id: credentialId },
                data: { lastSalesSyncedUntil: chunkEnd },
            });

            await this.log({
                storeId,
                endpoint: 'SIMPLE_SALES',
                rangeStart: start,
                rangeEnd: chunkEnd,
                success: true,
                message: `OK - ${totalOrders} pedido(s) em ${subWindows} sub-janela(s)${suspiciousWindows > 0 ? ` (${suspiciousWindows} perto do teto — ver log de warning)` : ''}.`,
                ordersFetched: totalOrders,
            });

            // Loja pediu pra substituir a planilha manual de vendas
            // (Venda/Lista) pelos itens que acabaram de ser sincronizados
            // aqui — recalcula os dias comerciais tocados por essa janela
            // (ver meep-product-sales-sync.service.ts). Não falha a
            // sincronização se isso der erro (só loga) — os dados da Meep
            // já foram gravados com sucesso, o pior caso é Venda/Lista
            // ficar um pouco atrasada até o próximo sync.
            //
            // lookbackDays=3: além dos dias tocados pela janela, reconcilia
            // os últimos 3 dias comerciais toda vez (barato: o rebuild pula
            // o dia que não mudou). Cobre o GetSales das 04h-14h que regrava
            // itens de dias antigos e rebuild anterior que falhou.
            try {
                const rebuild = await this.meepProductSalesSync.rebuildRange(storeId, start, chunkEnd, {
                    lookbackDays: 3,
                });
                await this.logRebuildErrors(storeId, start, chunkEnd, rebuild.erros);
            } catch (bridgeError: any) {
                this.logger.error(
                    `Falha ao atualizar Venda/Lista a partir da Meep (loja ${storeId}): ${bridgeError?.message}`,
                    bridgeError?.stack,
                );
                await this.logRebuildErrors(storeId, start, chunkEnd, [bridgeError?.message || String(bridgeError)]);
            }
        } catch (error: any) {
            await this.log({
                storeId,
                endpoint: 'SIMPLE_SALES',
                rangeStart: start,
                rangeEnd: chunkEnd,
                success: false,
                message: error?.message || String(error),
            });
            this.logger.warn(`Falha ao sincronizar SimpleSales da loja ${storeId}: ${error?.message}`);
        }
    }

    // Sincroniza GetSales (CFOP/NCM) — só pode rodar entre 04h e 14h
    // (horário da Meep). O cron já filtra isso antes de chamar, mas o
    // método também protege sozinho caso seja chamado manualmente fora
    // da janela.
    //
    // IMPORTANTE (corrigido depois de HTTP 500 / "Execution Timeout
    // Expired" recorrente da Meep nessa rota): diferente de
    // GetSimpleSales, GetSales/Get já pagina sozinho de verdade dentro de
    // meepClient.getSales (Page/Count reais, NextPage por pedido) — não
    // precisa (e não devia) passar por fetchOrdersInSubWindows, que
    // quebrava em pedaços de 3h sem efeito nenhum (Start/End dessa rota só
    // tem granularidade de DIA — formatDate corta pra "YYYY-MM-DD" — então
    // toda sub-janela dentro do mesmo dia mandava pra Meep a MESMA consulta
    // de novo) e só empilhava carga redundante.
    //
    // Mesmo removendo isso, uma chamada única pro chunk inteiro (até 3
    // dias) ainda deu timeout — "Execution Timeout Expired" dentro da
    // query SQL da própria Meep (GetSalesHead), ou seja, o problema real é
    // que a consulta DELES fica pesada demais pra uma janela de vários
    // dias de uma vez (provavelmente proporcional ao volume de pedidos no
    // período). Como Start/End tem granularidade de dia (não de hora), é
    // esse recorte que de fato muda o que a Meep varre — por isso agora o
    // chunk é varrido DIA A DIA (não em pedaços de 3h), com retry simples
    // em caso de timeout pontual: se um dia falhar mesmo depois do retry,
    // os outros dias do chunk continuam sendo buscados normalmente (não
    // trava o resto por causa de um dia ruim).
    private static readonly SALES_RETRY_DELAY_MS = 5000;

    private async syncSalesLocked(storeId: string, credentialId: string, cursorFrom: Date | null) {
        const now = new Date();
        const start = cursorFrom ?? new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const chunkEnd = new Date(Math.min(start.getTime() + 3 * 24 * 60 * 60 * 1000, now.getTime()));

        if (chunkEnd <= start) return;

        const uniqueOrderIds = new Set<string>();
        const falhas: string[] = [];
        const oneDayMs = 24 * 60 * 60 * 1000;
        let cursor = new Date(start);

        while (cursor < chunkEnd) {
            const dayEnd = new Date(Math.min(cursor.getTime() + oneDayMs, chunkEnd.getTime()));

            let tentativa = 0;
            let sucesso = false;
            let ultimoErro: any = null;

            while (tentativa < 2 && !sucesso) {
                tentativa += 1;
                try {
                    const { orders } = await this.meepClient.getSales(storeId, cursor, dayEnd);

                    for (const order of orders) {
                        if (order?.OrderId) uniqueOrderIds.add(order.OrderId);
                        await this.upsertOrder(storeId, order, 'SALES');
                    }

                    sucesso = true;
                } catch (error: any) {
                    ultimoErro = error;
                    if (tentativa < 2) {
                        this.logger.warn(
                            `Timeout/erro buscando Sales (CFOP) da loja ${storeId} em ${cursor.toISOString()}–${dayEnd.toISOString()} (tentativa ${tentativa}): ${error?.message} — tentando de novo em ${MeepSyncService.SALES_RETRY_DELAY_MS / 1000}s.`,
                        );
                        await new Promise((resolve) => setTimeout(resolve, MeepSyncService.SALES_RETRY_DELAY_MS));
                    }
                }
            }

            if (!sucesso) {
                falhas.push(`${cursor.toISOString()}–${dayEnd.toISOString()}: ${ultimoErro?.message || String(ultimoErro)}`);
                this.logger.warn(
                    `Falha ao sincronizar Sales (CFOP) da loja ${storeId} em ${cursor.toISOString()}–${dayEnd.toISOString()} mesmo após retry: ${ultimoErro?.message}`,
                );
            }

            cursor = dayEnd;

            if (cursor < chunkEnd) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
            }
        }

        if (falhas.length === 0) {
            await this.log({
                storeId,
                endpoint: 'SALES',
                rangeStart: start,
                rangeEnd: chunkEnd,
                success: true,
                message: `OK - ${uniqueOrderIds.size} pedido(s) com CFOP/NCM.`,
                ordersFetched: uniqueOrderIds.size,
            });
        } else {
            const falhouTudo = falhas.length === Math.ceil((chunkEnd.getTime() - start.getTime()) / oneDayMs);
            await this.log({
                storeId,
                endpoint: 'SALES',
                rangeStart: start,
                rangeEnd: chunkEnd,
                success: !falhouTudo,
                message: `${uniqueOrderIds.size} pedido(s) com CFOP/NCM salvos, mas ${falhas.length} dia(s) falharam mesmo após retry: ${falhas.join(' | ')}`,
                ordersFetched: uniqueOrderIds.size,
            });
        }
    }

    // Upsert em lote das transações de conciliação vindas da Meep —
    // extraído pra ser reaproveitado tanto pelo sync normal (trailing
    // window) quanto pela re-sincronização forçada manual (ver
    // forceResyncConciliation). Idempotente por meepTransactionId.
    private async upsertConciliationTransactions(storeId: string, transactions: any[]): Promise<number> {
        let saved = 0;

        for (const tx of transactions) {
            const meepTransactionId = tx.MeepTransactionId || tx.Id || tx.TransactionId;
            if (!meepTransactionId) continue;

            await this.prisma.meepConciliationTransaction.upsert({
                where: { meepTransactionId: String(meepTransactionId) },
                update: {
                    meepOrderId: tx.OrderId ?? null,
                    createdOn: tx.CreatedOn ? new Date(tx.CreatedOn) : new Date(),
                    createdOnBr: tx.CreatedOnBr ?? null,
                    authorizationNumber: tx.AuthorizationNumber ?? null,
                    grossValue: tx.GrossValue ?? tx.Value ?? 0,
                    ratePercentage: tx.RatePercentage ?? null,
                    rateValue: tx.RateValue ?? null,
                    rateValueAdvance: tx.RateValueAdvance ?? null,
                    netValue: tx.NetValue ?? tx.Value ?? 0,
                    dueDate: tx.DueDate ? new Date(tx.DueDate) : null,
                    installments: tx.Installments ?? null,
                    paymentTypeId: tx.PaymentTypeId ?? null,
                    paymentTypeName: tx.PaymentTypeName ?? tx.PaymentType ?? null,
                    cardFlagId: tx.CardFlagId ?? null,
                    cardFlagName: tx.CardFlagName ?? tx.CardBannerName ?? null,
                    pointOfSaleName: tx.PointOfSaleName ?? null,
                    rawJson: tx,
                },
                create: {
                    storeId,
                    meepTransactionId: String(meepTransactionId),
                    meepOrderId: tx.OrderId ?? null,
                    createdOn: tx.CreatedOn ? new Date(tx.CreatedOn) : new Date(),
                    createdOnBr: tx.CreatedOnBr ?? null,
                    authorizationNumber: tx.AuthorizationNumber ?? null,
                    grossValue: tx.GrossValue ?? tx.Value ?? 0,
                    ratePercentage: tx.RatePercentage ?? null,
                    rateValue: tx.RateValue ?? null,
                    rateValueAdvance: tx.RateValueAdvance ?? null,
                    netValue: tx.NetValue ?? tx.Value ?? 0,
                    dueDate: tx.DueDate ? new Date(tx.DueDate) : null,
                    installments: tx.Installments ?? null,
                    paymentTypeId: tx.PaymentTypeId ?? null,
                    paymentTypeName: tx.PaymentTypeName ?? tx.PaymentType ?? null,
                    cardFlagId: tx.CardFlagId ?? null,
                    cardFlagName: tx.CardFlagName ?? tx.CardBannerName ?? null,
                    pointOfSaleName: tx.PointOfSaleName ?? null,
                    rawJson: tx,
                },
            });

            saved += 1;
        }

        return saved;
    }

    // Sincroniza GetTransactionsForConciliation — restrição da Meep: no
    // máximo 24h por chamada (ver meep-client.service.ts), então um
    // período maior é varrido em pedaços de 1 dia.
    //
    // Diferente do SimpleSales/Sales, aqui NÃO confiamos só no cursor pra
    // decidir de onde começar: a conciliação de cartão pode chegar com
    // atraso em relação à venda (liquidação não é instantânea — uma
    // transação de hoje pode só aparecer nessa rota dias depois). Por
    // isso sempre reconsulta uma janela de reforço de alguns dias pra
    // trás em toda chamada (CONCILIATION_LOOKBACK_DAYS, upsert por
    // meepTransactionId torna isso seguro/idempotente) — e avança mais
    // ainda quando o cursor está mais atrasado que isso (catch-up).
    private static readonly CONCILIATION_LOOKBACK_DAYS = 4;

    async syncConciliation(storeId: string, credentialId: string, cursorFrom: Date | null) {
        const now = new Date();
        const lookbackStart = new Date(
            now.getTime() - MeepSyncService.CONCILIATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
        );
        const start = cursorFrom && cursorFrom < lookbackStart ? cursorFrom : lookbackStart;

        if (now <= start) return;

        const oneDayMs = 24 * 60 * 60 * 1000;
        let cursor = new Date(start);
        let totalSaved = 0;
        let chunks = 0;

        try {
            while (cursor < now) {
                const chunkEnd = new Date(Math.min(cursor.getTime() + oneDayMs, now.getTime()));
                const result = await this.meepClient.getTransactionsForConciliation(storeId, cursor, chunkEnd);
                totalSaved += await this.upsertConciliationTransactions(storeId, result.transactions);
                chunks += 1;
                cursor = chunkEnd;

                if (cursor < now) {
                    await new Promise((resolve) => setTimeout(resolve, 1200));
                }
            }

            await this.prisma.meepCredential.update({
                where: { id: credentialId },
                data: { lastConciliationSyncedUntil: now },
            });

            await this.log({
                storeId,
                endpoint: 'CONCILIATION',
                rangeStart: start,
                rangeEnd: now,
                success: true,
                message: `OK - ${totalSaved} transação(ões) em ${chunks} dia(s).`,
                transactionsFetched: totalSaved,
            });
        } catch (error: any) {
            await this.log({
                storeId,
                endpoint: 'CONCILIATION',
                rangeStart: start,
                rangeEnd: now,
                success: false,
                message: error?.message || String(error),
            });
            this.logger.warn(`Falha ao sincronizar conciliação da loja ${storeId}: ${error?.message}`);
        }
    }

    // Re-sincronização forçada da conciliação de cartão pra um período
    // escolhido por quem chama — pro caso de a liquidação ter atrasado
    // mais que CONCILIATION_LOOKBACK_DAYS (ou de o usuário só querer
    // forçar um reforço manual num dia específico). Mesma varredura em
    // pedaços de 1 dia do sync normal, mas sem depender do cursor.
    async forceResyncConciliation(storeId: string, credentialId: string, from: Date, to: Date) {
        const now = new Date();
        const end = to > now ? now : to;

        if (end <= from) {
            return { totalTransactions: 0, chunks: 0 };
        }

        const oneDayMs = 24 * 60 * 60 * 1000;
        let cursor = new Date(from);
        let totalTransactions = 0;
        let chunks = 0;

        while (cursor < end) {
            const chunkEnd = new Date(Math.min(cursor.getTime() + oneDayMs, end.getTime()));

            try {
                const result = await this.meepClient.getTransactionsForConciliation(storeId, cursor, chunkEnd);
                const saved = await this.upsertConciliationTransactions(storeId, result.transactions);
                totalTransactions += saved;
                chunks += 1;

                await this.log({
                    storeId,
                    endpoint: 'CONCILIATION',
                    rangeStart: cursor,
                    rangeEnd: chunkEnd,
                    success: true,
                    message: `OK (re-sincronização forçada) - ${saved} transação(ões).`,
                    transactionsFetched: saved,
                });
            } catch (error: any) {
                await this.log({
                    storeId,
                    endpoint: 'CONCILIATION',
                    rangeStart: cursor,
                    rangeEnd: chunkEnd,
                    success: false,
                    message: `Re-sincronização forçada falhou: ${error?.message || String(error)}`,
                });
                this.logger.warn(
                    `Falha na re-sincronização forçada de conciliação da loja ${storeId} (${cursor.toISOString()}–${chunkEnd.toISOString()}): ${error?.message}`,
                );
            }

            cursor = chunkEnd;

            if (cursor < end) {
                await new Promise((resolve) => setTimeout(resolve, 1200));
            }
        }

        const credential = await this.prisma.meepCredential.findUnique({
            where: { id: credentialId },
            select: { lastConciliationSyncedUntil: true },
        });

        if (!credential?.lastConciliationSyncedUntil || credential.lastConciliationSyncedUntil < end) {
            await this.prisma.meepCredential.update({
                where: { id: credentialId },
                data: { lastConciliationSyncedUntil: end },
            });
        }

        return { totalTransactions, chunks };
    }

    // A cada hora: SimpleSales + Conciliação pra todas as lojas com
    // credencial ativa. Cada chamada já se limita sozinha à janela
    // máxima permitida, então mesmo rodando de hora em hora ela só avança
    // aos poucos se o cursor estiver muito atrasado.
    @Cron('15 * * * *')
    async hourlySync() {
        const credentials = await this.activeCredentials();

        for (const credential of credentials) {
            await this.syncSimpleSales(credential.storeId, credential.id, credential.lastSalesSyncedUntil);
            // Pequena pausa entre chamadas pra não bater muitas requisições
            // seguidas no "bot anti-abuso" que a Meep menciona na doc.
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await this.syncConciliation(credential.storeId, credential.id, credential.lastConciliationSyncedUntil);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    // GetSales (CFOP/NCM) só pode ser chamada entre 04h e 14h (restrição
    // da própria Meep) — roda de hora em hora dentro dessa janela. Usa o
    // mesmo cursor de vendas (lastSalesSyncedUntil já avançado pelo
    // hourlySync), então aqui só reforça CFOP/NCM sobre o que acabou de
    // ser gravado, sem cursor próprio.
    @Cron('45 4-13 * * *')
    async salesCfopWindowSync() {
        const credentials = await this.activeCredentials();

        for (const credential of credentials) {
            // Reconsulta as últimas 3 dias pra garantir que os pedidos
            // recentes ganhem CFOP/NCM (a rota não tem cursor próprio de
            // propósito — é sempre "os últimos dias", já que é a única
            // fonte de CFOP e não queremos depender de um segundo cursor
            // desalinhado do de pagamentos).
            await this.syncSales(credential.storeId, credential.id, null);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}
