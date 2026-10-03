/**
 * Diagnóstico pontual do GetSales (rota de CFOP/NCM) depois de corrigir o
 * caminho real da rota (era "/GetSales", o certo é "/Get" — confirmado na
 * doc oficial da Meep) e a paginação (Page/Count agora obrigatórios,
 * resposta é array direto, NextPage vem por pedido). O client
 * (meep-client.service.ts) já pagina sozinho internamente, então esse
 * script só confere quantos pedidos (com CFOP/NCM) voltam pros dias
 * testados.
 *
 * Atenção: GetSales só pode ser chamada entre 04h e 14h (horário deles)
 * — o client já bloqueia fora desse horário.
 *
 * Como rodar (de dentro da pasta backend):
 *   npx ts-node -r tsconfig-paths/register scripts/meep/inspect-getsales.ts <storeId>
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { MeepClientService } from '../../src/meep/meep-client.service';

async function main() {
    const [storeId] = process.argv.slice(2);

    if (!storeId) {
        console.error('Uso: npx ts-node scripts/meep/inspect-getsales.ts <storeId>');
        process.exit(1);
    }

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    try {
        const meepClient = app.get(MeepClientService);

        const dias = ['2026-09-28', '2026-09-29'];

        for (const dia of dias) {
            const start = new Date(`${dia}T00:00:00.000Z`);
            const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

            const resultado = await meepClient.getSales(storeId, start, end);
            const datas = resultado.orders
                .map((o: any) => o.OrderDateUtc ?? o.Date)
                .filter(Boolean)
                .sort();
            const comCfop = resultado.orders.filter((o: any) =>
                (o.Itens ?? []).some((item: any) => item.Cfop),
            );

            console.log(`\n=== GetSales dia ${dia} ===`);
            console.log('Total de pedidos:', resultado.orders.length);
            console.log('Pedidos com pelo menos um item com CFOP:', comCfop.length);
            if (datas.length > 0) {
                console.log('Mais antigo:', datas[0], '| Mais recente:', datas[datas.length - 1]);
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
