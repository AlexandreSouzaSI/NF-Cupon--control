import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ensureStoreAccessScoped } from '../common/store-scope.util';
import {
    businessDayKey as businessDayKeyUtil,
    businessDayStartUtc,
    businessDayEndUtc,
} from '../common/business-day.util';
import { meepItemValue, normalizarProdutoChave } from '../common/meep-item-value.util';
import {
    buildCashConciliationPdf,
    type CashConciliationReportRow,
} from './meep-cash-conciliation-report-builder';

// A Meep manda o "tipo" de pagamento em texto livre (nome que ela mesma
// usa) — normaliza pras 4 colunas fixas da planilha de referência do
// usuário (ver também CashConciliationTab.tsx, que tem a mesma lógica
// no frontend pra tela). O que não bate com nenhuma delas ainda entra
// no Total Venda (bruto real), só não aparece destacado numa coluna
// própria.
function bucketOfPaymentType(tipo: string): 'credito' | 'debito' | 'pix' | 'dinheiro' | null {
    const t = tipo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

    if (t.includes('pix')) return 'pix';
    if (t.includes('credito')) return 'credito';
    if (t.includes('debito')) return 'debito';
    if (t.includes('dinheiro') || t.includes('cash')) return 'dinheiro';
    return null;
}

// Consultas pras telas de Vendas Meep: itens vendidos por dia (Venda/
// Lista), impostos/CFOP por venda e conciliação de caixa por tipo de
// pagamento. Tudo lido do que o sync service (meep-sync.service.ts) já
// gravou localmente — nenhuma chamada à API da Meep acontece aqui.
@Injectable()
export class MeepQueryService {
    constructor(private prisma: PrismaService) { }

    // Regra de "dia comercial" (08h-04h Brasília) extraída pra
    // src/common/business-day.util.ts — reaproveitada também pelo bridge
    // que alimenta Venda/Lista a partir da Meep (ver
    // meep-product-sales-sync.service.ts), pra não duplicar a mesma
    // conta em dois lugares.
    private businessDayKey(utcDate: Date): string {
        return businessDayKeyUtil(utcDate);
    }

    private dateRange(dateFrom?: string, dateTo?: string) {
        const end = dateTo ? businessDayEndUtc(dateTo) : new Date();
        const start = dateFrom
            ? businessDayStartUtc(dateFrom)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

        return { start, end };
    }

    // Itens vendidos por dia (quantidade + valor) — base da tela Venda/
    // Lista. Agrupa em memória porque o período típico (até 31 dias) é
    // pequeno o bastante pra não pesar.
    async itemsPerDay(storeId: string, user: any, dateFrom?: string, dateTo?: string) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);
        const { start, end } = this.dateRange(dateFrom, dateTo);

        // Pra marcar "Aguardando informação": só o dia de HOJE (o mais
        // recente da lista, ainda em andamento) fica pendente — assim que
        // vira amanhã, hoje passa a mostrar o número final (a rotina D+1
        // já rebuscou ele de madrugada/manhã por trás, sem precisar
        // segurar a tela esperando) e só o novo dia de hoje fica pendente.
        // Todo o resto do histórico sempre mostra o número normal.
        const diaDeHoje = this.businessDayKey(new Date());

        const items = await this.prisma.meepOrderItem.findMany({
            where: {
                order: { storeId, orderDateUtc: { gte: start, lte: end } },
            },
            select: {
                productName: true,
                quantity: true,
                total: true,
                unitValue: true,
                order: { select: { orderDateUtc: true } },
            },
        });

        // Agrupa pela MESMA chave de produto e a MESMA fórmula de valor que
        // o Venda/Lista (ver meep-item-value.util.ts) — antes agrupava pelo
        // nome cru e somava só `total ?? unitValue` (sem multiplicar por
        // quantidade), então as duas telas podiam divergir lendo os mesmos
        // itens.
        const byDay = new Map<
            string,
            Map<string, { nome: string; quantidade: number; valor: number }>
        >();

        for (const item of items) {
            const day = this.businessDayKey(item.order.orderDateUtc);
            if (!byDay.has(day)) byDay.set(day, new Map());

            const dayMap = byDay.get(day)!;
            const chave = normalizarProdutoChave(item.productName || '');
            const current = dayMap.get(chave) || {
                nome: (item.productName || '').trim(),
                quantidade: 0,
                valor: 0,
            };
            current.quantidade += Number(item.quantity);
            current.valor += meepItemValue(item);
            dayMap.set(chave, current);
        }

        return Array.from(byDay.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dia, produtos]) => ({
                dia,
                aguardandoConfirmacao: dia === diaDeHoje,
                produtos: Array.from(produtos.values())
                    .map((dados) => ({ ...dados }))
                    .sort((a, b) => b.valor - a.valor),
            }));
    }

    // Vendas com CFOP/NCM no período — pra conferência fiscal. Inclui
    // também a forma de pagamento (crédito/débito/dinheiro/etc): o tipo
    // "resumido" (order.paymentType, sempre vem no GetSimpleSales) e o
    // detalhamento por transação (MeepOrderPayment, só vem quando a
    // Meep manda o array Payments — pedidos pagos em mais de uma forma
    // aparecem com várias entradas aqui).
    async salesWithTax(storeId: string, user: any, dateFrom?: string, dateTo?: string) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);
        const { start, end } = this.dateRange(dateFrom, dateTo);

        const orders = await this.prisma.meepOrder.findMany({
            where: { storeId, orderDateUtc: { gte: start, lte: end } },
            orderBy: { orderDateUtc: 'desc' },
            include: { items: true, payments: true },
        });

        return orders.map((order) => ({
            id: order.id,
            meepOrderId: order.meepOrderId,
            data: order.orderDateUtc,
            status: order.status,
            valor: order.value,
            tipoPagamento: order.paymentType,
            pagamentos: order.payments.map((payment) => ({
                tipo: payment.type,
                valor: payment.value,
                bandeira: payment.cardBannerName,
            })),
            itens: order.items.map((item) => ({
                nome: item.productName,
                quantidade: item.quantity,
                valorUnitario: item.unitValue,
                total: item.total,
                cfop: item.cfop,
                ncm: item.ncm,
            })),
        }));
    }

    // Conciliação de caixa: total por tipo de pagamento, por dia —
    // crédito/débito/dinheiro/PIX/outros, igual o usuário pediu. Cada dia
    // também traz os lançamentos manuais complementares (Freelancer/
    // Descontos/Outros/Vale/Observação — ver MeepCashExtra), pra montar a
    // grade completa igual a planilha que o usuário usava antes.
    //
    // Fonte dos valores: MeepOrderPayment (o mesmo pagamento detalhado por
    // pedido que já aparece na aba "Vendas e Impostos", vindo do
    // GetSimpleSales). NÃO usa mais MeepConciliationTransaction
    // (GetTransactionsForConciliation) — essa rota é a liquidação de
    // cartão da própria Meep, que só existe quando a loja processa cartão
    // pela maquininha integrada à Meep; lojas que usam maquininha externa
    // (Cielo, Stone, etc.) nunca têm nada ali, mesmo com venda normal
    // acontecendo e aparecendo certinho em Vendas e Impostos. Pagamento
    // por pedido é o dado que sempre existe e bate com o que o usuário vê
    // na outra tela.
    async cashConciliation(storeId: string, user: any, dateFrom?: string, dateTo?: string) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);
        const { start, end } = this.dateRange(dateFrom, dateTo);

        const orders = await this.prisma.meepOrder.findMany({
            where: { storeId, orderDateUtc: { gte: start, lte: end } },
            include: { payments: true },
        });

        const byDay = new Map<string, Map<string, { bruto: number; liquido: number; taxa: number; quantidade: number }>>();

        for (const order of orders) {
            const day = this.businessDayKey(order.orderDateUtc);
            if (!byDay.has(day)) byDay.set(day, new Map());
            const dayMap = byDay.get(day)!;

            // Pedido sincronizado com pagamento detalhado (caso comum,
            // GetSimpleSales traz o array Payments) — soma cada forma de
            // pagamento separadamente, inclusive pedidos pagos em mais de
            // uma forma.
            if (order.payments.length > 0) {
                for (const payment of order.payments) {
                    // Achado na prática: a Meep às vezes marca um Pix como
                    // type="DEBITO" com a bandeira do cartão
                    // (cardBannerName) vindo "Pix" — sem esse ajuste, Pix
                    // real cairia no balde de Débito. Se a bandeira
                    // mencionar Pix, o tipo efetivo vira "PIX"
                    // independente do que veio em `type`.
                    const bandeiraMencionaPix = (payment.cardBannerName || '')
                        .toLowerCase()
                        .includes('pix');
                    const tipo = bandeiraMencionaPix ? 'PIX' : (payment.type || 'OUTROS');
                    const current = dayMap.get(tipo) || { bruto: 0, liquido: 0, taxa: 0, quantidade: 0 };
                    current.bruto += Number(payment.value);
                    current.liquido += Number(payment.value);
                    current.quantidade += 1;
                    dayMap.set(tipo, current);
                }
            } else {
                // Sem pagamento detalhado ainda (raro — pedido só passou
                // pelo GetSales de CFOP, não pelo GetSimpleSales) — lança
                // o valor bruto do pedido inteiro em "OUTROS" pra não
                // sumir do Total Venda, só não aparece numa coluna
                // específica.
                const current = dayMap.get('OUTROS') || { bruto: 0, liquido: 0, taxa: 0, quantidade: 0 };
                current.bruto += Number(order.value);
                current.liquido += Number(order.value);
                current.quantidade += 1;
                dayMap.set('OUTROS', current);
            }
        }

        // Dias com conciliação automática da Meep podem não cobrir todo o
        // intervalo pedido (ex: loja sem venda num dia) — junta também os
        // dias que só têm lançamento manual (Freelancer/Vale/etc), senão a
        // grade "pula" esses dias.
        const extras = await this.cashExtrasInRange(storeId, start, end);
        for (const dia of extras.keys()) {
            if (!byDay.has(dia)) byDay.set(dia, new Map());
        }

        return Array.from(byDay.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([dia, tipos]) => ({
                dia,
                tipos: Array.from(tipos.entries()).map(([tipo, dados]) => ({ tipo, ...dados })),
                totalBruto: Array.from(tipos.values()).reduce((sum, d) => sum + d.bruto, 0),
                totalLiquido: Array.from(tipos.values()).reduce((sum, d) => sum + d.liquido, 0),
                extras: extras.get(dia) ?? {
                    freelancer: 0,
                    descontos: 0,
                    outros: 0,
                    vale: 0,
                    observacao: null,
                    sistemaCredito: null,
                    sistemaDebito: null,
                    sistemaPix: null,
                    sistemaDinheiro: null,
                    bancoCredito: null,
                    bancoDebito: null,
                    bancoPix: null,
                    bancoDinheiro: null,
                },
            }));
    }

    // Busca os lançamentos manuais (MeepCashExtra) de um intervalo de
    // datas (UTC), indexados por businessDay — reaproveitado tanto pela
    // conciliação quanto pelo relatório semanal.
    private async cashExtrasInRange(storeId: string, start: Date, end: Date) {
        const diaInicio = this.businessDayKey(start);
        const diaFim = this.businessDayKey(end);

        const rows = await this.prisma.meepCashExtra.findMany({
            where: {
                storeId,
                businessDay: { gte: diaInicio, lte: diaFim },
            },
        });

        const map = new Map<
            string,
            {
                freelancer: number;
                descontos: number;
                outros: number;
                vale: number;
                observacao: string | null;
                sistemaCredito: number | null;
                sistemaDebito: number | null;
                sistemaPix: number | null;
                sistemaDinheiro: number | null;
                bancoCredito: number | null;
                bancoDebito: number | null;
                bancoPix: number | null;
                bancoDinheiro: number | null;
            }
        >();

        for (const row of rows) {
            map.set(row.businessDay, {
                freelancer: Number(row.freelancer),
                descontos: Number(row.descontos),
                outros: Number(row.outros),
                vale: Number(row.vale),
                observacao: row.observacao,
                sistemaCredito: row.sistemaCredito !== null ? Number(row.sistemaCredito) : null,
                sistemaDebito: row.sistemaDebito !== null ? Number(row.sistemaDebito) : null,
                sistemaPix: row.sistemaPix !== null ? Number(row.sistemaPix) : null,
                sistemaDinheiro: row.sistemaDinheiro !== null ? Number(row.sistemaDinheiro) : null,
                bancoCredito: row.bancoCredito !== null ? Number(row.bancoCredito) : null,
                bancoDebito: row.bancoDebito !== null ? Number(row.bancoDebito) : null,
                bancoPix: row.bancoPix !== null ? Number(row.bancoPix) : null,
                bancoDinheiro: row.bancoDinheiro !== null ? Number(row.bancoDinheiro) : null,
            });
        }

        return map;
    }

    // Relatório Diário/Semanal em PDF — mesma grade da tela (dia a dia +
    // total do período), reaproveitando cashConciliation() pra não
    // duplicar a lógica de agrupamento/bucket.
    async cashConciliationReportPdf(
        storeId: string,
        user: any,
        dateFrom?: string,
        dateTo?: string,
    ) {
        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
            select: { name: true },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        const dias = await this.cashConciliation(storeId, user, dateFrom, dateTo);

        const rows: CashConciliationReportRow[] = dias.map((dia) => {
            const buckets = { credito: 0, debito: 0, pix: 0, dinheiro: 0 };
            for (const tipo of dia.tipos) {
                const bucket = bucketOfPaymentType(tipo.tipo);
                if (bucket) buckets[bucket] += tipo.bruto;
            }

            // Banco x Diferença só entram no relatório Semanal (ver
            // buildCashConciliationPdf) — aqui já vem calculado porque o
            // builder não tem acesso ao MeepCashExtra. "Editável" é o
            // valor corrigido pelo usuário quando existe, senão cai no
            // valor calculado da Meep (mesma regra da tela).
            const sistemaCredito = dia.extras.sistemaCredito ?? buckets.credito;
            const sistemaDebito = dia.extras.sistemaDebito ?? buckets.debito;
            const sistemaPix = dia.extras.sistemaPix ?? buckets.pix;
            const sistemaDinheiro = dia.extras.sistemaDinheiro ?? buckets.dinheiro;
            const bancoCredito = dia.extras.bancoCredito ?? 0;
            const bancoDebito = dia.extras.bancoDebito ?? 0;
            const bancoPix = dia.extras.bancoPix ?? 0;
            const bancoDinheiro = dia.extras.bancoDinheiro ?? 0;

            const sistemaTotal = sistemaCredito + sistemaDebito + sistemaPix + sistemaDinheiro;
            const bancoTotal = bancoCredito + bancoDebito + bancoPix + bancoDinheiro;

            return {
                dia: dia.dia,
                credito: buckets.credito,
                debito: buckets.debito,
                pix: buckets.pix,
                dinheiro: buckets.dinheiro,
                totalVenda: dia.totalBruto,
                freelancer: dia.extras.freelancer,
                descontos: dia.extras.descontos,
                outros: dia.extras.outros,
                vale: dia.extras.vale,
                observacao: dia.extras.observacao,
                bancoTotal,
                diferenca: bancoTotal - sistemaTotal,
                // Por categoria — usados só no resumo textual abaixo da
                // tabela (ver buildCashConciliationPdf), pra dizer exatamente
                // qual forma de pagamento ficou faltando/sobrando no banco,
                // não só o total.
                diffCredito: bancoCredito - sistemaCredito,
                diffDebito: bancoDebito - sistemaDebito,
                diffPix: bancoPix - sistemaPix,
                diffDinheiro: bancoDinheiro - sistemaDinheiro,
            };
        });

        return buildCashConciliationPdf({ storeName: store.name, rows });
    }

    // Salva (upsert) o lançamento manual de um dia comercial — Freelancer/
    // Descontos/Outros/Vale/Observação, complementando o que a Meep já
    // manda sozinha (Credito/Debito/PIX/Dinheiro).
    async upsertCashExtra(
        storeId: string,
        user: any,
        input: {
            businessDay: string;
            freelancer?: number;
            descontos?: number;
            outros?: number;
            vale?: number;
            observacao?: string;
            sistemaCredito?: number;
            sistemaDebito?: number;
            sistemaPix?: number;
            sistemaDinheiro?: number;
            bancoCredito?: number;
            bancoDebito?: number;
            bancoPix?: number;
            bancoDinheiro?: number;
        },
    ) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        const data = {
            storeId,
            businessDay: input.businessDay,
            freelancer: input.freelancer ?? 0,
            descontos: input.descontos ?? 0,
            outros: input.outros ?? 0,
            vale: input.vale ?? 0,
            observacao: input.observacao ?? null,
            sistemaCredito: input.sistemaCredito ?? null,
            sistemaDebito: input.sistemaDebito ?? null,
            sistemaPix: input.sistemaPix ?? null,
            sistemaDinheiro: input.sistemaDinheiro ?? null,
            bancoCredito: input.bancoCredito ?? null,
            bancoDebito: input.bancoDebito ?? null,
            bancoPix: input.bancoPix ?? null,
            bancoDinheiro: input.bancoDinheiro ?? null,
            updatedById: user?.id ?? null,
        };

        return this.prisma.meepCashExtra.upsert({
            where: { storeId_businessDay: { storeId, businessDay: input.businessDay } },
            create: data,
            update: data,
        });
    }

    // Últimas tentativas de sincronização — mesmo espírito do
    // getSefazSyncLogs em stores.service.ts, mas pra Meep.
    async syncLogs(storeId: string, user: any) {
        await ensureStoreAccessScoped(this.prisma, storeId, user);

        return this.prisma.meepSyncLog.findMany({
            where: { storeId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
    }
}
