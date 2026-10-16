import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Só leitura: conta pedidos Meep cujos itens estão em dobro no banco
// (mais itens gravados do que o próprio JSON da Meep tem em rawJson.Itens)
// e mostra o total por dia. Não altera nada.
//
// Uso (dentro de backend/):
//   npx ts-node prisma/scripts/check-dup-meep-items.ts

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    const total = await prisma.$queryRaw<{ pedidos: number }[]>`
        SELECT COUNT(*)::int AS pedidos
        FROM "MeepOrder" o
        JOIN (SELECT "orderId", COUNT(*) c FROM "MeepOrderItem" GROUP BY 1) i
          ON i."orderId" = o.id
        WHERE jsonb_typeof(o."rawJson"->'Itens') = 'array'
          AND i.c > jsonb_array_length(o."rawJson"->'Itens')
    `;

    console.log(`Pedidos com itens em dobro: ${total[0]?.pedidos ?? 0}`);

    const porDia = await prisma.$queryRaw<{ dia: string; pedidos: number }[]>`
        SELECT to_char(o."orderDateUtc" - interval '3 hours', 'YYYY-MM-DD') AS dia,
               COUNT(*)::int AS pedidos
        FROM "MeepOrder" o
        JOIN (SELECT "orderId", COUNT(*) c FROM "MeepOrderItem" GROUP BY 1) i
          ON i."orderId" = o.id
        WHERE jsonb_typeof(o."rawJson"->'Itens') = 'array'
          AND i.c > jsonb_array_length(o."rawJson"->'Itens')
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 40
    `;

    for (const linha of porDia) {
        console.log(`${linha.dia}: ${linha.pedidos} pedido(s)`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
