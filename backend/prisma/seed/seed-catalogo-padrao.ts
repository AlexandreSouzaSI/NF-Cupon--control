import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// Recria o catálogo de Estoque + Ficha Técnica de Anchieta e Contagem a
// partir do JSON gerado por prisma/scripts/export-catalogo-padrao.ts.
// Roda sempre que o seed roda (inclusive depois de um `prisma migrate
// reset`, local ou na VPS) — é o jeito de não perder esse cadastro numa
// zerada geral do banco: em vez de restaurar um backup do banco inteiro
// (que traria de volta compras/contas/notas de teste junto), só esses
// dois catálogos voltam, do zero (saldo de estoque começa em 0, sem
// histórico de movimentação).
//
// Se o arquivo catalogo-padrao.json ainda não existir (primeira vez, ou
// alguém rodando o seed sem ter exportado antes), só avisa e segue — não
// quebra o seed.
export async function seedCatalogoPadrao(
    prisma: PrismaClient,
    storeIdsByKey: Record<'ANCHIETA' | 'CONTAGEM', string>,
) {
    const jsonPath = path.join(__dirname, 'catalogo-padrao.json');

    if (!fs.existsSync(jsonPath)) {
        console.log(
            'catalogo-padrao.json não encontrado — pulando recriação de Estoque/Ficha Técnica ' +
            '(rode "npm run export:catalogo-padrao" enquanto o banco atual ainda tem esses dados, ANTES de zerar).',
        );
        return;
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as {
        stores: Record<
            'ANCHIETA' | 'CONTAGEM',
            {
                stockItems: Array<{
                    nome: string;
                    nomeChave: string;
                    categoria: string | null;
                    descricao: string | null;
                    unidadeMedida: string;
                    pesoUnidadeGramas: string | null;
                    isProteina: boolean;
                    porcaoPadraoGramas: string | null;
                    categoriaLista: string | null;
                    ordemLista: number | null;
                    estoqueMinimo: string | null;
                    estoqueMaximo: string | null;
                    active: boolean;
                }>;
                productionItems: Array<{
                    nome: string;
                    nomeChave: string;
                    unidadeMedida: string;
                    baseQuantidade: string;
                    active: boolean;
                    recipeItems: Array<{
                        stockItemChave: string | null;
                        quantidade: string;
                    }>;
                }>;
                productRecipeItems: Array<{
                    produtoChave: string;
                    produto: string;
                    stockItemChave: string | null;
                    productionItemChave: string | null;
                    gramas: string;
                }>;
            }
        >;
    };

    for (const storeKey of ['ANCHIETA', 'CONTAGEM'] as const) {
        const storeId = storeIdsByKey[storeKey];
        const storeData = data.stores[storeKey];

        if (!storeId || !storeData) continue;

        // 1) StockItem — chave nomeChave dentro da loja.
        const stockItemIdByChave = new Map<string, string>();

        for (const item of storeData.stockItems) {
            const saved = await prisma.stockItem.upsert({
                where: {
                    storeId_nomeChave: { storeId, nomeChave: item.nomeChave },
                },
                update: {
                    nome: item.nome,
                    categoria: item.categoria,
                    descricao: item.descricao,
                    unidadeMedida: item.unidadeMedida as any,
                    pesoUnidadeGramas: item.pesoUnidadeGramas,
                    isProteina: item.isProteina,
                    porcaoPadraoGramas: item.porcaoPadraoGramas,
                    categoriaLista: item.categoriaLista,
                    ordemLista: item.ordemLista,
                    estoqueMinimo: item.estoqueMinimo,
                    estoqueMaximo: item.estoqueMaximo,
                    active: item.active,
                },
                create: {
                    storeId,
                    nome: item.nome,
                    nomeChave: item.nomeChave,
                    categoria: item.categoria,
                    descricao: item.descricao,
                    unidadeMedida: item.unidadeMedida as any,
                    pesoUnidadeGramas: item.pesoUnidadeGramas,
                    isProteina: item.isProteina,
                    porcaoPadraoGramas: item.porcaoPadraoGramas,
                    categoriaLista: item.categoriaLista,
                    ordemLista: item.ordemLista,
                    estoqueMinimo: item.estoqueMinimo,
                    estoqueMaximo: item.estoqueMaximo,
                    active: item.active,
                    // Saldo sempre começa do zero — o que veio no export é
                    // só a definição do item, não o estoque físico real.
                    quantidadeAtual: 0,
                },
            });

            stockItemIdByChave.set(item.nomeChave, saved.id);
        }

        // 2) ProductionItem + sua receita (aponta pra StockItem).
        const productionItemIdByChave = new Map<string, string>();

        for (const item of storeData.productionItems) {
            const saved = await prisma.productionItem.upsert({
                where: {
                    storeId_nomeChave: { storeId, nomeChave: item.nomeChave },
                },
                update: {
                    nome: item.nome,
                    unidadeMedida: item.unidadeMedida as any,
                    baseQuantidade: item.baseQuantidade,
                    active: item.active,
                },
                create: {
                    storeId,
                    nome: item.nome,
                    nomeChave: item.nomeChave,
                    unidadeMedida: item.unidadeMedida as any,
                    baseQuantidade: item.baseQuantidade,
                    active: item.active,
                    quantidadeAtual: 0,
                },
            });

            productionItemIdByChave.set(item.nomeChave, saved.id);

            for (const recipeItem of item.recipeItems) {
                const stockItemId = recipeItem.stockItemChave
                    ? stockItemIdByChave.get(recipeItem.stockItemChave)
                    : undefined;

                if (!stockItemId) continue;

                await prisma.productionRecipeItem.upsert({
                    where: {
                        productionItemId_stockItemId: {
                            productionItemId: saved.id,
                            stockItemId,
                        },
                    },
                    update: { quantidade: recipeItem.quantidade },
                    create: {
                        productionItemId: saved.id,
                        stockItemId,
                        quantidade: recipeItem.quantidade,
                    },
                });
            }
        }

        // 3) ProductRecipeItem — Ficha Técnica de cada prato, ligando em
        // StockItem OU ProductionItem (nunca os dois, ver schema.prisma).
        for (const item of storeData.productRecipeItems) {
            const stockItemId = item.stockItemChave
                ? stockItemIdByChave.get(item.stockItemChave)
                : undefined;
            const productionItemId = item.productionItemChave
                ? productionItemIdByChave.get(item.productionItemChave)
                : undefined;

            if (!stockItemId && !productionItemId) continue;

            if (stockItemId) {
                await prisma.productRecipeItem.upsert({
                    where: {
                        storeId_produtoChave_stockItemId: {
                            storeId,
                            produtoChave: item.produtoChave,
                            stockItemId,
                        },
                    },
                    update: { produto: item.produto, gramas: item.gramas },
                    create: {
                        storeId,
                        produtoChave: item.produtoChave,
                        produto: item.produto,
                        stockItemId,
                        gramas: item.gramas,
                    },
                });
            } else if (productionItemId) {
                await prisma.productRecipeItem.upsert({
                    where: {
                        storeId_produtoChave_productionItemId: {
                            storeId,
                            produtoChave: item.produtoChave,
                            productionItemId,
                        },
                    },
                    update: { produto: item.produto, gramas: item.gramas },
                    create: {
                        storeId,
                        produtoChave: item.produtoChave,
                        produto: item.produto,
                        productionItemId,
                        gramas: item.gramas,
                    },
                });
            }
        }

        console.log(
            `${storeKey}: catálogo padrão recriado — ${storeData.stockItems.length} item(ns) de Estoque, ` +
            `${storeData.productionItems.length} item(ns) de Produção, ${storeData.productRecipeItems.length} linha(s) de Ficha Técnica.`,
        );
    }
}
