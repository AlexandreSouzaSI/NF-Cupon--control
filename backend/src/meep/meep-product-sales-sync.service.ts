import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductSalesImportOrigem } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
    PRODUCT_SALES_IMPORTED_EVENT,
    type ProductSalesImportedEvent,
} from '../common/events';
import {
    businessDayKeysInRange,
    businessDayStartUtc,
    businessDayEndUtc,
} from '../common/business-day.util';
import {
    meepItemValue,
    normalizarProdutoChave,
    produtoExcluidoDaAnalise,
} from '../common/meep-item-value.util';

// Ponte Meep -> Venda/Lista: a loja pediu pra substituir a planilha
// manual (ImportProductSalesTab) pelos itens que já vêm sincronizados
// da API Meep (MeepOrder/MeepOrderItem) — em vez de reescrever toda a
// lógica de Dashboard/Produtos/Ficha Técnica/Relatório/Lista de Compra
// (que hoje lê ProductSalesEntry), este serviço GERA um
// ProductSalesImport por dia comercial a partir dos itens da Meep,
// reaproveitando 100% daquela lógica já pronta e testada.
//
// Cada dia comercial (ver business-day.util.ts) vira UM
// ProductSalesImport com origem=MEEP e meepBusinessDay=<a chave do
// dia> — chamado de novo (ex: a cada hora, quando o cron da Meep
// roda), ele apaga e recria as entries daquele dia com os números
// atualizados (idempotente: mesmo storeId+meepBusinessDay sempre cai
// no mesmo import, via @@unique). O evento PRODUCT_SALES_IMPORTED_EVENT
// é reemitido em cada rebuild — quem escuta (baixa automática de
// Estoque/Produção) já corrige o lançamento pela DIFERENÇA de
// quantidade (sourceRef estável), então não duplica nem fica pra trás
// conforme as vendas do dia vão entrando.
//
// Categoria: a Meep não documenta nenhum campo de categoria de produto
// no item (só nome, quantidade e valor) — por isso, SEM catálogo
// importado, toda linha entraria como categoria fixa "Vendas Meep".
// Agora existe um fallback real: se a loja já importou o PDF de
// "Produtos" do painel da Meep (ver
// ProductSalesService.importarCatalogoPdf / ProductCatalogItem), a
// categoria de cada produto vem de lá (ver categoriaMap em
// rebuildBusinessDay) — essa constante só é usada pro produto que
// ainda não está no catálogo daquela loja (ex: item novo no cardápio,
// ou loja que ainda não importou nenhum PDF).
const CATEGORIA_PADRAO = 'Vendas Meep';

@Injectable()
export class MeepProductSalesSyncService {
    private readonly logger = new Logger(MeepProductSalesSyncService.name);

    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
    ) { }

    // Chamado pelo MeepSyncService depois de um sync de SIMPLE_SALES —
    // recalcula todo dia comercial que o intervalo [from, to] tocar.
    // Devolve um resumo (diagnóstico) pra quem chamou manualmente (ex:
    // botão "Reconstruir Venda/Lista agora") conseguir ver o que
    // realmente aconteceu, já que isso roda sem acesso direto ao banco.
    //
    // lookbackDays: além da janela pedida, também reconcilia os últimos N
    // dias comerciais até agora. Motivo: alguns caminhos mexem em
    // MeepOrderItem DEPOIS do dia ter sido "fechado" pelo cursor (GetSales
    // das 04h-14h regrava os itens dos últimos 3 dias, a Meep entrega
    // pedido atrasado, um rebuild anterior falhou) e, sem isso, o
    // Venda/Lista daquele dia ficaria congelado numa foto antiga pra
    // sempre — só o dia "tocado" pelo cursor era refeito. Como o rebuild
    // pula sozinho o dia que não mudou (ver rebuildBusinessDay), é barato.
    //
    // force: reescreve mesmo se nada mudou (botão manual).
    async rebuildRange(
        storeId: string,
        from: Date,
        to: Date,
        opts: { lookbackDays?: number; force?: boolean } = {},
    ) {
        const dias = new Set(businessDayKeysInRange(from, to));

        if (opts.lookbackDays && opts.lookbackDays > 0) {
            const agora = new Date();
            const inicioLookback = new Date(
                agora.getTime() - opts.lookbackDays * 24 * 60 * 60 * 1000,
            );
            for (const dia of businessDayKeysInRange(inicioLookback, agora)) {
                dias.add(dia);
            }
        }

        const listaDias = Array.from(dias).sort();

        let totalItensEncontrados = 0;
        let diasComVenda = 0;
        let diasAlterados = 0;
        const erros: string[] = [];

        for (const dia of listaDias) {
            try {
                const resultado = await this.rebuildBusinessDay(storeId, dia, {
                    force: opts.force,
                });
                totalItensEncontrados += resultado.itensEncontrados;
                if (resultado.itensEncontrados > 0) diasComVenda += 1;
                if (resultado.alterado) diasAlterados += 1;
            } catch (error) {
                const message = (error as Error).message;
                erros.push(`${dia}: ${message}`);
                this.logger.error(
                    `Falha ao reconstruir Venda/Lista (Meep) — loja ${storeId}, dia ${dia}: ${message}`,
                    (error as Error).stack,
                );
            }
        }

        return {
            diasVarridos: listaDias.length,
            diasComVenda,
            diasAlterados,
            totalItensEncontrados,
            erros,
        };
    }

    // Recalcula UM dia comercial: soma os itens de todos os MeepOrder
    // daquela janela (agrupados por produto), e upserta o
    // ProductSalesImport + entries correspondentes.
    async rebuildBusinessDay(
        storeId: string,
        dia: string,
        opts: { force?: boolean } = {},
    ): Promise<{
        itensEncontrados: number;
        produtosDistintos: number;
        valorTotal: number;
        alterado: boolean;
    }> {
        const start = businessDayStartUtc(dia);
        const end = businessDayEndUtc(dia);

        const [items, catalogItems, existente] = await Promise.all([
            this.prisma.meepOrderItem.findMany({
                where: {
                    order: { storeId, orderDateUtc: { gte: start, lte: end } },
                },
                select: {
                    productName: true,
                    quantity: true,
                    total: true,
                    unitValue: true,
                },
            }),
            this.prisma.productCatalogItem.findMany({
                where: { storeId },
                select: { produtoChave: true, categoria: true },
            }),
            this.prisma.productSalesImport.findUnique({
                where: { storeId_meepBusinessDay: { storeId, meepBusinessDay: dia } },
                select: {
                    id: true,
                    totalLinhas: true,
                    periodoInicio: true,
                    periodoFim: true,
                    entries: {
                        select: { produtoChave: true, quantidade: true, valor: true },
                    },
                },
            }),
        ]);

        const categoriaMap = new Map(
            catalogItems.map((item) => [item.produtoChave, item.categoria]),
        );

        const porProduto = new Map<
            string,
            { produto: string; quantidade: number; valor: number }
        >();

        for (const item of items) {
            const produto = (item.productName || '').trim();
            if (!produto) continue;

            const produtoChave = normalizarProdutoChave(produto);
            const quantidade = Number(item.quantity);
            // Mesma fórmula do Itens por Dia (ver meep-item-value.util.ts).
            const valor = meepItemValue(item);

            const atual = porProduto.get(produtoChave);
            if (atual) {
                atual.quantidade += quantidade;
                atual.valor += valor;
            } else {
                porProduto.set(produtoChave, { produto, quantidade, valor });
            }
        }

        const entradas = Array.from(porProduto.entries()).map(
            ([produtoChave, dados]) => ({
                categoria: categoriaMap.get(produtoChave) ?? CATEGORIA_PADRAO,
                produto: dados.produto,
                produtoChave,
                quantidade: dados.quantidade,
                // Decimal(12,2): arredonda aqui pra comparação de "mudou?"
                // abaixo não ficar falsa-positiva por ponto flutuante.
                valor: Math.round(dados.valor * 100) / 100,
            }),
        );

        const valorTotal = entradas.reduce((soma, e) => soma + e.valor, 0);
        const resumo = {
            itensEncontrados: items.length,
            produtosDistintos: entradas.length,
            valorTotal,
        };

        // Nenhum item vendido nesse dia (ainda) — não cria import vazio;
        // se já existia um de uma sincronização anterior (ex: pedido
        // cancelado depois), zera as entries dele.
        if (entradas.length === 0) {
            if (existente && existente.entries.length > 0) {
                await this.prisma.productSalesEntry.deleteMany({
                    where: { importId: existente.id },
                });
                await this.prisma.productSalesImport.update({
                    where: { id: existente.id },
                    data: { totalLinhas: 0 },
                });
                return { ...resumo, alterado: true };
            }
            return { ...resumo, alterado: false };
        }

        // Nada mudou desde o último rebuild: não reescreve nem reemite o
        // evento (que dispara a baixa automática de Estoque/Produção).
        // Importa porque agora o cron reconcilia os últimos dias TODA hora.
        if (!opts.force && existente && this.igualAoExistente(existente, entradas, start, end)) {
            return { ...resumo, alterado: false };
        }

        // Transação com timeout folgado e INSERT em lote (createMany).
        // Antes: `entries: { create: [...] }` aninhado — o Prisma faz um
        // INSERT por linha, e com ~160 produtos num banco remoto a
        // transação interativa estourava o timeout padrão de 5s ("Transaction
        // already closed"), dava rollback do delete+insert e o dia ficava
        // congelado na última foto que coube em 5s (o dia com MAIS produtos
        // é justamente o que falha). createMany é 1 INSERT por lote.
        const importId = await this.prisma.$transaction(
            async (tx) => {
                const registro = await tx.productSalesImport.upsert({
                    where: { storeId_meepBusinessDay: { storeId, meepBusinessDay: dia } },
                    update: {
                        totalLinhas: entradas.length,
                        // Self-heal: garante que o import cobre o dia
                        // comercial inteiro mesmo se nasceu com janela errada.
                        periodoInicio: start,
                        periodoFim: end,
                    },
                    create: {
                        storeId,
                        origem: ProductSalesImportOrigem.MEEP,
                        meepBusinessDay: dia,
                        nomeLocal: 'Meep (sincronização automática)',
                        arquivoOriginal: `meep-auto-${dia}`,
                        totalLinhas: entradas.length,
                        periodoInicio: start,
                        periodoFim: end,
                    },
                    select: { id: true },
                });

                await tx.productSalesEntry.deleteMany({
                    where: { importId: registro.id },
                });

                const TAMANHO_LOTE = 500;
                for (let i = 0; i < entradas.length; i += TAMANHO_LOTE) {
                    await tx.productSalesEntry.createMany({
                        data: entradas
                            .slice(i, i + TAMANHO_LOTE)
                            .map((entrada) => ({ ...entrada, importId: registro.id })),
                    });
                }

                return registro.id;
            },
            { timeout: 60_000, maxWait: 10_000 },
        );

        this.eventEmitter.emit(PRODUCT_SALES_IMPORTED_EVENT, {
            storeId,
            productSalesImportId: importId,
        } satisfies ProductSalesImportedEvent);

        return { ...resumo, alterado: true };
    }

    private igualAoExistente(
        existente: {
            totalLinhas: number;
            periodoInicio: Date | null;
            periodoFim: Date | null;
            entries: { produtoChave: string; quantidade: unknown; valor: unknown }[];
        },
        entradas: { produtoChave: string; quantidade: number; valor: number }[],
        start: Date,
        end: Date,
    ): boolean {
        if (existente.periodoInicio?.getTime() !== start.getTime()) return false;
        if (existente.periodoFim?.getTime() !== end.getTime()) return false;
        if (existente.entries.length !== entradas.length) return false;

        const atuais = new Map(
            existente.entries.map((e) => [e.produtoChave, e]),
        );

        return entradas.every((nova) => {
            const antiga = atuais.get(nova.produtoChave);
            if (!antiga) return false;
            return (
                Math.abs(Number(antiga.quantidade) - nova.quantidade) < 0.0005 &&
                Math.abs(Number(antiga.valor) - nova.valor) < 0.005
            );
        });
    }

    // Conferência Meep x Venda/Lista de UM dia comercial: lê os mesmos
    // MeepOrderItem que o "Itens por Dia" e compara com o que está salvo
    // em ProductSalesEntry. Só leitura — serve pra saber, sem acesso ao
    // banco, se o Venda/Lista daquele dia está defasado (e por quê).
    async checkBusinessDay(storeId: string, dia: string) {
        const start = businessDayStartUtc(dia);
        const end = businessDayEndUtc(dia);

        const [items, importacao, importacoesQueSobrepoem] = await Promise.all([
            this.prisma.meepOrderItem.findMany({
                where: { order: { storeId, orderDateUtc: { gte: start, lte: end } } },
                select: {
                    orderId: true,
                    meepItemId: true,
                    productName: true,
                    quantity: true,
                    total: true,
                    unitValue: true,
                },
            }),
            this.prisma.productSalesImport.findUnique({
                where: { storeId_meepBusinessDay: { storeId, meepBusinessDay: dia } },
                select: {
                    id: true,
                    totalLinhas: true,
                    periodoInicio: true,
                    periodoFim: true,
                    createdAt: true,
                    entries: {
                        select: { produtoChave: true, quantidade: true, valor: true },
                    },
                },
            }),
            // Qualquer OUTRO import (ex: planilha manual) que sobreponha o
            // dia entra no filtro por período de Venda/Lista e soma junto.
            this.prisma.productSalesImport.findMany({
                where: {
                    storeId,
                    periodoFim: { gte: start },
                    periodoInicio: { lte: end },
                    NOT: { meepBusinessDay: dia },
                },
                select: {
                    id: true,
                    origem: true,
                    meepBusinessDay: true,
                    arquivoOriginal: true,
                },
            }),
        ]);

        const somar = (
            linhas: { produtoChave: string; quantidade: number; valor: number }[],
            excluirTaxas: boolean,
        ) => {
            const chaves = new Set<string>();
            let quantidade = 0;
            let valor = 0;
            for (const linha of linhas) {
                if (excluirTaxas && produtoExcluidoDaAnalise(linha.produtoChave)) continue;
                chaves.add(linha.produtoChave);
                quantidade += linha.quantidade;
                valor += linha.valor;
            }
            return {
                produtosDistintos: chaves.size,
                quantidade: Math.round(quantidade * 1000) / 1000,
                valor: Math.round(valor * 100) / 100,
            };
        };

        const linhasMeep = items.map((item) => ({
            produtoChave: normalizarProdutoChave(item.productName || ''),
            quantidade: Number(item.quantity),
            valor: meepItemValue(item),
        }));

        const linhasVendaLista = (importacao?.entries ?? []).map((e) => ({
            produtoChave: e.produtoChave,
            quantidade: Number(e.quantidade),
            valor: Number(e.valor),
        }));

        // Linhas duplicadas em MeepOrderItem (mesmo pedido+meepItemId
        // repetido) inflariam as DUAS telas — sinal de corrida entre syncs.
        const vistos = new Map<string, number>();
        for (const item of items) {
            if (!item.meepItemId) continue;
            const chave = `${item.orderId}:${item.meepItemId}`;
            vistos.set(chave, (vistos.get(chave) ?? 0) + 1);
        }
        const itensDuplicados = Array.from(vistos.values()).filter((n) => n > 1).length;

        const meepBruto = somar(linhasMeep, false);
        const meepSemTaxas = somar(linhasMeep, true);
        const vendaLista = somar(linhasVendaLista, false);

        return {
            dia,
            janelaUtc: { inicio: start.toISOString(), fim: end.toISOString() },
            itensMeep: items.length,
            itensMeepComNomeVazio: items.filter((i) => !(i.productName || '').trim()).length,
            itensDuplicadosPorMeepItemId: itensDuplicados,
            meep: {
                bruto: meepBruto,
                // Comparável com Venda/Lista: sem taxa de serviço/couvert.
                semTaxaECouvert: meepSemTaxas,
            },
            vendaLista: {
                existeImport: Boolean(importacao),
                importId: importacao?.id ?? null,
                importCriadoEm: importacao?.createdAt ?? null,
                periodoInicio: importacao?.periodoInicio ?? null,
                periodoFim: importacao?.periodoFim ?? null,
                ...vendaLista,
            },
            diferenca: {
                produtosDistintos: meepSemTaxas.produtosDistintos - vendaLista.produtosDistintos,
                quantidade:
                    Math.round((meepSemTaxas.quantidade - vendaLista.quantidade) * 1000) / 1000,
                valor: Math.round((meepSemTaxas.valor - vendaLista.valor) * 100) / 100,
            },
            defasado:
                !importacao ||
                Math.abs(meepSemTaxas.valor - vendaLista.valor) >= 0.01 ||
                meepSemTaxas.produtosDistintos !== vendaLista.produtosDistintos,
            outrosImportsQueSobrepoemODia: importacoesQueSobrepoem,
        };
    }
}
