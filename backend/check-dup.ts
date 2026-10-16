import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient(); // ajuste igual ao seu script de backfill (adapter, se usar)

async function main() {
    const r = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS pedidos_com_itens_em_dobro
    FROM "MeepOrder" o
    JOIN (SELECT "orderId", COUNT(*) c FROM "MeepOrderItem" GROUP BY 1) i ON i."orderId" = o.id
    WHERE jsonb_typeof(o."rawJson"->'Itens') = 'array'
      AND i.c > jsonb_array_length(o."rawJson"->'Itens')`;
    console.log(r);
}
main().finally(() => prisma.$disconnect());