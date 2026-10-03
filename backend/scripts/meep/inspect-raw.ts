/**
 * Diagnóstico pontual: o formatDate() do meep-client.service.ts manda só
 * a data (YYYY-MM-DD) pra Meep, sem hora — então qualquer sub-janela
 * dentro do mesmo dia calendário vira o MESMO request pro servidor deles
 * (confirmado: uma janela de 6h, 3h e até 20min no mesmo dia voltaram com
 * o mesmo total de 104 pedidos). Esse script testa a hipótese de que a
 * granularidade real da API é por dia inteiro — chama GetSimpleSales com
 * Start=End=<um dia> pra cada um dos dias 27/28/29/09, e mostra quantos
 * pedidos vêm e o intervalo real de datas (OrderDateUtc mín/máx) dos
 * pedidos retornados, pra ver se um dia sozinho já estoura o teto ou não.
 *
 * Como rodar (de dentro da pasta backend):
 *   npx ts-node -r tsconfig-paths/register scripts/meep/inspect-raw.ts <storeId>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { MeepClientService } from '../../src/meep/meep-client.service';

async function main() {
    const [storeId] = process.argv.slice(2);

    if (!storeId) {
        console.error('Uso: npx ts-node scripts/meep/inspect-raw.ts <storeId>');
        process.exit(1);
    }

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const meepClient = app.get(MeepClientService);

        const dias = ['2026-09-27', '2026-09-28', '2026-09-29'];

        for (const dia of dias) {
            const start = new Date(`${dia}T00:00:00.000Z`);
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // dia + 1

            const result = await meepClient.getSimpleSales(storeId, start, end, 1);

            const datas = result.orders
                .map((o: any) => o.OrderDateUtc)
                .filter(Boolean)
                .sort();

            console.log(`\n=== Dia ${dia} (Start=${dia}, End=dia seguinte) ===`);
            console.log('Total de pedidos:', result.orders.length);
            console.log('NextPage:', result.nextPage);
            if (datas.length > 0) {
                console.log('OrderDateUtc mais antigo:', datas[0]);
                console.log('OrderDateUtc mais recente:', datas[datas.length - 1]);
            }

            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
    } finally {
        await app.close();
    }
}

main().catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
});
