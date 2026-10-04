/**
 * Importa o catálogo de produtos (nome + categoria) extraído do PDF
 * "Produtos" exportado do painel da Meep, direto pro banco — via
 * ProductCatalogItem (ver src/product-sales/meep-catalog-pdf-parser.ts
 * pra entender o formato do PDF e a lógica de parsing).
 *
 * Existe PORQUE o sandbox onde esse catálogo foi implementado não tinha
 * acesso ao Postgres de produção nem rede pra instalar o pdf-parse — então
 * em vez de rodar a importação direto (como o endpoint POST
 * /product-sales/catalog/import-pdf faz), este script roda a MESMA lógica
 * localmente, pra você (ou quem for repetir isso pra Anchieta/Raiz depois)
 * não precisar subir o frontend só pra isso.
 *
 * Sobe o AppModule inteiro do Nest (igual scripts/meep/backfill-day.ts)
 * pra reaproveitar o PrismaService já configurado, em vez de duplicar a
 * conexão com o banco aqui.
 *
 * Como rodar (de dentro da pasta backend, depois de "npm install" pra
 * trazer o pdf-parse e "npx prisma generate" pra reconhecer
 * ProductCatalogItem):
 *
 *   npx ts-node scripts/seed-product-catalog.ts <caminho-do-pdf> <nome-ou-trecho-da-loja>
 *
 * Exemplos:
 *   npx ts-node scripts/seed-product-catalog.ts "C:\Users\alemo\Downloads\Produtos Contagem Meep.pdf" Contagem
 *   npx ts-node scripts/seed-product-catalog.ts "C:\Users\alemo\Downloads\Produtos Anchieta Meep.pdf" Anchieta
 *   npx ts-node scripts/seed-product-catalog.ts "C:\Users\alemo\Downloads\Produtos Raiz Meep.pdf" Raiz
 *
 * O segundo argumento é comparado contra Store.name com "contains"
 * (case-insensitive) — não precisa ser o nome exato da loja, só um trecho
 * único o bastante pra não bater em mais de uma loja. Se bater em 0 ou em
 * mais de 1 loja, o script lista as lojas encontradas e para sem gravar
 * nada.
 *
 * É seguro rodar de novo com o mesmo PDF (ou um PDF atualizado da mesma
 * loja): cada produto é upsert por [storeId, produtoChave], então só
 * atualiza a categoria se ela tiver mudado — nunca duplica.
 */

import { readFileSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../prisma/prisma.service';
import { parseMeepCatalogPdf } from '../src/product-sales/meep-catalog-pdf-parser';

// Mesma normalização usada em product-sales.service.ts — a chave que
// identifica o produto dentro da loja (storeId + produtoChave é único).
function normalizarProduto(nome: string): string {
    return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

async function main() {
    const [pdfPath, lojaTrecho] = process.argv.slice(2);

    if (!pdfPath || !lojaTrecho) {
        console.error(
            'Uso: npx ts-node scripts/seed-product-catalog.ts <caminho-do-pdf> <nome-ou-trecho-da-loja>',
        );
        process.exit(1);
    }

    let buffer: Buffer;
    try {
        buffer = readFileSync(pdfPath);
    } catch (error) {
        console.error(`Não consegui ler o arquivo "${pdfPath}":`, (error as Error).message);
        process.exit(1);
    }

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const prisma = app.get(PrismaService);

        const lojas = await prisma.store.findMany({
            where: { name: { contains: lojaTrecho, mode: 'insensitive' } },
            select: { id: true, name: true },
        });

        if (lojas.length === 0) {
            console.error(`Nenhuma loja encontrada com nome contendo "${lojaTrecho}".`);
            process.exit(1);
        }

        if (lojas.length > 1) {
            console.error(
                `Mais de uma loja encontrada com nome contendo "${lojaTrecho}" — seja mais específico:`,
            );
            for (const loja of lojas) console.error(`  - ${loja.name} (${loja.id})`);
            process.exit(1);
        }

        const loja = lojas[0];
        console.log(`Loja: ${loja.name} (${loja.id})`);
        console.log(`Lendo e extraindo o PDF "${pdfPath}"...`);

        const itens = await parseMeepCatalogPdf(buffer);
        console.log(`PDF processado: ${itens.length} produtos com categoria encontrados.`);

        if (itens.length === 0) {
            console.error('Nenhum produto extraído do PDF — confira se é o relatório "Produtos" da Meep.');
            process.exit(1);
        }

        let novos = 0;
        let atualizados = 0;

        for (const item of itens) {
            const produtoChave = normalizarProduto(item.produto);

            const resultado = await prisma.productCatalogItem.upsert({
                where: { storeId_produtoChave: { storeId: loja.id, produtoChave } },
                update: { produto: item.produto, categoria: item.categoria },
                create: {
                    storeId: loja.id,
                    produtoChave,
                    produto: item.produto,
                    categoria: item.categoria,
                },
            });

            // createdAt === updatedAt só no primeiro insert (upsert não
            // devolve isso direto, então comparamos as datas).
            if (resultado.createdAt.getTime() === resultado.updatedAt.getTime()) {
                novos += 1;
            } else {
                atualizados += 1;
            }
        }

        const categorias = Array.from(new Set(itens.map((i) => i.categoria))).sort();

        console.log('\nImportação concluída:');
        console.log(`  Total processado: ${itens.length}`);
        console.log(`  Novos: ${novos}`);
        console.log(`  Atualizados: ${atualizados}`);
        console.log(`\nCategorias encontradas (${categorias.length}):`);
        for (const categoria of categorias) console.log(`  - ${categoria}`);
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
});
