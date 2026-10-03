/**
 * Backfill pontual: reconsulta a janela de vendas (GetSimpleSales) que ficou
 * pra trás por causa do bug de paginação corrigido em meep-sync.service.ts
 * (a página 1 era lida e o cursor já avançava pro fim da janela de 3 dias
 * sem checar se havia página 2+ — qualquer coisa que estivesse nas páginas
 * seguintes ficava pra sempre sem ser sincronizada).
 *
 * Diferente de scripts/meep/debug-items.ts, esse aqui sobe o AppModule
 * inteiro do Nest (NestFactory.createApplicationContext) pra reaproveitar
 * a lógica real de credencial/decriptação/paginação já corrigida, em vez
 * de duplicar tudo isso num script solto.
 *
 * Como rodar (de dentro da pasta backend):
 *   npx ts-node scripts/meep/backfill-day.ts <storeId> <dataInicioISO>
 *
 * Exemplo (cobre o dia comercial 29/09 com folga, sem medo de duplicar —
 * upsert por meepOrderId é idempotente):
 *   npx ts-node scripts/meep/backfill-day.ts loja-contagem 2026-09-28T20:00:00.000Z
 *
 * O cursor normal (lastSalesSyncedUntil) é avançado pro fim da janela
 * reconsultada, igual o sync de sempre faz — como a janela pedida aqui é
 * sempre limitada a "agora" (chunkEnd = min(start+3d, agora)), isso nunca
 * regride o cursor pra trás de onde ele já estava.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { MeepSyncService } from '../../src/meep/meep-sync.service';
import { PrismaService } from '../../prisma/prisma.service';

async function main() {
    const [storeId, startIso] = process.argv.slice(2);

    if (!storeId || !startIso) {
        console.error(
            'Uso: npx ts-node scripts/meep/backfill-day.ts <storeId> <dataInicioISO>',
        );
        process.exit(1);
    }

    const start = new Date(startIso);
    if (isNaN(start.getTime())) {
        console.error(`Data de início inválida: ${startIso}`);
        process.exit(1);
    }

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const prisma = app.get(PrismaService);
        const meepSyncService = app.get(MeepSyncService);

        const credential = await prisma.meepCredential.findUnique({ where: { storeId } });
        if (!credential) {
            console.error(`Nenhuma credencial Meep encontrada pra storeId=${storeId}`);
            process.exit(1);
        }

        console.log(`Rodando syncSimpleSales pra storeId=${storeId} a partir de ${start.toISOString()}...`);
        console.log('(a janela real ainda é limitada a 3 dias por chamada, igual o sync normal)');

        await meepSyncService.syncSimpleSales(storeId, credential.id, start);

        const ultimoLog = await prisma.meepSyncLog.findFirst({
            where: { storeId, endpoint: 'SIMPLE_SALES' },
            orderBy: { createdAt: 'desc' },
        });

        console.log('\nResultado do backfill (último log SIMPLE_SALES):');
        console.log(ultimoLog);
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
});
