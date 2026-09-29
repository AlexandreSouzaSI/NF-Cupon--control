import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Roda UMA VEZ, ANTES de zerar o banco (npx prisma migrate reset), pra
// tirar uma "foto" do catálogo de Estoque + Ficha Técnica das lojas
// Anchieta e Contagem (as únicas duas que hoje têm esse cadastro pronto —
// Raiz nasce vazia) e salvar num JSON estático dentro do repo
// (prisma/seed/catalogo-padrao.json). O seed.ts lê esse JSON e recria tudo
// de novo depois de qualquer reset, local ou na VPS — sem precisar rodar
// esse export de novo (o JSON já fica versionado no git).
//
// Uso: dentro de backend/, com o banco ATUAL ainda de pé:
//   npx ts-node prisma/scripts/export-catalogo-padrao.ts
//
// Exporta:
// - StockItem (Estoque): definição do item (nome, categoria, unidade,
//   pesoUnidadeGramas, isProteina, porcaoPadraoGramas, categoriaLista,
//   ordemLista, estoqueMinimo, estoqueMaximo) — SEM quantidadeAtual nem
//   valorMedioUnitario, porque isso é saldo/preço real de estoque, não
//   faz sentido "recriar" como padrão; o item volta com saldo 0.
// - ProductionItem (Produção/pré-preparo) + ProductionRecipeItem (receita
//   dele em cima de StockItem) — mesma lógica de saldo zerado.
// - ProductRecipeItem (Ficha Técnica): cada prato e quanto ele consome de
//   um StockItem OU ProductionItem.

const STORE_IDS_TO_EXPORT: Record<string, string> = {
    'loja-anchieta': 'ANCHIETA',
    'loja-contagem': 'CONTAGEM',
};

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    const output: any = {
        exportedAt: new Date().toISOString(),
        stores: {},
    };

    for (const [storeId, storeKey] of Object.entries(STORE_IDS_TO_EXPORT)) {
        const store = await prisma.store.findUnique({ where: { id: storeId } });

        if (!store) {
            console.warn(
                `Aviso: loja "${storeId}" não encontrada no banco atual — pulando (nada exportado pra ela).`,
            );
            continue;
        }

        const stockItems = await prisma.stockItem.findMany({
            where: { storeId },
            orderBy: { nome: 'asc' },
        });

        const productionItems = await prisma.productionItem.findMany({
            where: { storeId },
            include: { recipeItems: true },
            orderBy: { nome: 'asc' },
        });

        const productRecipeItems = await prisma.productRecipeItem.findMany({
            where: { storeId },
            orderBy: [{ produto: 'asc' }],
        });

        // Mapas id -> chave, pra não gravar UUID nenhum no JSON (o seed
        // recria com IDs novos e reconecta tudo pela chave/nome, não pelo
        // id antigo, que deixa de existir depois do reset).
        const stockItemIdToKey = new Map(
            stockItems.map((item) => [item.id, item.nomeChave]),
        );
        const productionItemIdToKey = new Map(
            productionItems.map((item) => [item.id, item.nomeChave]),
        );

        output.stores[storeKey] = {
            stockItems: stockItems.map((item) => ({
                nome: item.nome,
                nomeChave: item.nomeChave,
                categoria: item.categoria,
                descricao: item.descricao,
                unidadeMedida: item.unidadeMedida,
                pesoUnidadeGramas: item.pesoUnidadeGramas?.toString() ?? null,
                isProteina: item.isProteina,
                porcaoPadraoGramas: item.porcaoPadraoGramas?.toString() ?? null,
                categoriaLista: item.categoriaLista,
                ordemLista: item.ordemLista,
                estoqueMinimo: item.estoqueMinimo?.toString() ?? null,
                estoqueMaximo: item.estoqueMaximo?.toString() ?? null,
                active: item.active,
            })),
            productionItems: productionItems.map((item) => ({
                nome: item.nome,
                nomeChave: item.nomeChave,
                unidadeMedida: item.unidadeMedida,
                baseQuantidade: item.baseQuantidade.toString(),
                active: item.active,
                recipeItems: item.recipeItems.map((recipeItem) => ({
                    stockItemChave:
                        stockItemIdToKey.get(recipeItem.stockItemId) ?? null,
                    quantidade: recipeItem.quantidade.toString(),
                })),
            })),
            productRecipeItems: productRecipeItems.map((item) => ({
                produtoChave: item.produtoChave,
                produto: item.produto,
                stockItemChave: item.stockItemId
                    ? stockItemIdToKey.get(item.stockItemId) ?? null
                    : null,
                productionItemChave: item.productionItemId
                    ? productionItemIdToKey.get(item.productionItemId) ?? null
                    : null,
                gramas: item.gramas.toString(),
            })),
        };

        console.log(
            `${storeKey}: ${stockItems.length} item(ns) de Estoque, ${productionItems.length} item(ns) de Produção, ${productRecipeItems.length} linha(s) de Ficha Técnica.`,
        );
    }

    const outputPath = path.join(
        __dirname,
        '..',
        'seed',
        'catalogo-padrao.json',
    );

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

    console.log(`\nSalvo em: ${outputPath}`);
    console.log(
        'Confira esse arquivo, dê commit nele, e SÓ DEPOIS rode o prisma migrate reset.',
    );
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
