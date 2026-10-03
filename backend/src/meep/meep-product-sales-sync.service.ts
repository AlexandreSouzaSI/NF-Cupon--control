import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductSalesImportOrigem } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
    PRODUCT_SALES_IMPORTED_EVENT,
    type ProductSalesImportedEvent,
} from '../common/events';
import {
    businessDayKey,
    businessDayKeysInRange,
    businessDayStartUtc,
    businessDayEndUtc,
} from '../common/business-day.util';

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
// no item (só nome, quantidade e valor) — por isso toda linha entra
// como categoria fixa "Vendas Meep". Isso só afeta a exibição em
// "cards por categoria" da aba Produtos e o filtro de bebida da Lista
// de Compra (que na prática não pega nada, já que bebida normalmente
// não tem ficha técnica cadastrada).
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
    async rebuildRange(storeId: string, from: Date, to: Date) {
        const dias = businessDayKeysInRange(from, to);

        let totalItensEncontrados = 0;
        let diasComVenda = 0;
        const erros: string[] = [];

        for (const dia of dias) {
            try {
                const resultado = await this.rebuildBusinessDay(storeId, dia);
                totalItensEncontrados += resultado.itensEncontrados;
                if (resultado.itensEncontrados > 0) diasComVenda += 1;
            } catch (error) {
                const message = (error as Error).message;
                erros.push(`${dia}: ${message}`);
                this.logger.error(
                    `Falha ao reconstruir Venda/Lista (Meep) — loja ${storeId}, dia ${dia}: ${message}`,
                );
            }
        }

        return {
            diasVarridos: dias.length,
            diasComVenda,
            totalItensEncontrados,
            erros,
        };
    }

    // Recalcula UM dia comercial: soma os itens de todos os MeepOrder
    // daquela janela (agrupados por produto), e upserta o
    // ProductSalesImport + entries correspondentes.
    async rebuildBusinessDay(storeId: string, dia: string): Promise<{ itensEncontrados: number }> {
        const start = businessDayStartUtc(dia);
        const end = businessDayEndUtc(dia);

        const items = await this.prisma.meepOrderItem.findMany({
            where: {
                order: { storeId, orderDateUtc: { gte: start, lte: end } },
            },
            select: {
                productName: true,
                quantity: true,
                total: true,
                unitValue: true,
            },
        });

        const porProduto = new Map<
            string,
            { produto: string; quantidade: number; valor: number }
        >();

        for (const item of items) {
            const produto = (item.productName || '').trim();
            if (!produto) continue;

            const produtoChave = normalizarProduto(produto);
            const quantidade = Number(item.quantity);
            const valor =
                item.total != null
                    ? Number(item.total)
                    : Number(item.unitValue) * quantidade;

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
                categoria: CATEGORIA_PADRAO,
                produto: dados.produto,
                produtoChave,
                quantidade: dados.quantidade,
                valor: dados.valor,
            }),
        );

        const existente = await this.prisma.productSalesImport.findUnique({
            where: { storeId_meepBusinessDay: { storeId, meepBusinessDay: dia } },
            select: { id: true },
        });

        // Nenhum item vendido nesse dia (ainda) — não cria import vazio;
        // se já existia um de uma sincronização anterior (ex: pedido
        // cancelado depois), zera as entries dele.
        if (entradas.length === 0) {
            if (existente) {
                await this.prisma.productSalesEntry.deleteMany({
                    where: { importId: existente.id },
                });
                await this.prisma.productSalesImport.update({
                    where: { id: existente.id },
                    data: { totalLinhas: 0 },
                });
            }
            return { itensEncontrados: items.length };
        }

        const importId = await this.prisma.$transaction(async (tx) => {
            if (existente) {
                await tx.productSalesEntry.deleteMany({
                    where: { importId: existente.id },
                });

                await tx.productSalesImport.update({
                    where: { id: existente.id },
                    data: {
                        totalLinhas: entradas.length,
                        entries: { create: entradas },
                    },
                });

                return existente.id;
            }

            const criado = await tx.productSalesImport.create({
                data: {
                    storeId,
                    origem: ProductSalesImportOrigem.MEEP,
                    meepBusinessDay: dia,
                    nomeLocal: 'Meep (sincronização automática)',
                    arquivoOriginal: `meep-auto-${dia}`,
                    totalLinhas: entradas.length,
                    periodoInicio: start,
                    periodoFim: end,
                    entries: { create: entradas },
                },
            });

            return criado.id;
        });

        this.eventEmitter.emit(PRODUCT_SALES_IMPORTED_EVENT, {
            storeId,
            productSalesImportId: importId,
        } satisfies ProductSalesImportedEvent);

        return { itensEncontrados: items.length };
    }
}

// Mesma normalização usada em product-sales.service.ts (maiúsculo, sem
// espaço duplicado) — duplicada aqui de propósito pra não criar
// dependência de ProductSalesModule dentro de MeepModule; os dois só
// precisam concordar no FORMATO da chave, não compartilhar código.
function normalizarProduto(nome: string): string {
    return nome
        .toString()
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}
