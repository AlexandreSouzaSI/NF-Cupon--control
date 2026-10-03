/**
 * Diagnóstico pontual pra investigar "sumiço" de itens/dias na tela Vendas
 * Meep. Lê direto do banco (não chama a API da Meep) e mostra, pro storeId
 * informado:
 *   - quantos MeepOrder existem por DIA DE CALENDÁRIO (UTC) do orderDateUtc
 *   - quantos MeepOrder existem por DIA COMERCIAL (08h-04h Brasília) — a
 *     mesma conta que o itemsPerDay() usa
 *   - quantos desses pedidos NÃO têm nenhum MeepOrderItem (upsert pode ter
 *     deixado "órfão" sem item)
 *   - os 3 pedidos mais antigos e mais recentes, com orderDateUtc bruto
 *
 * Como rodar:
 *   cd backend
 *   npx ts-node scripts/meep/debug-items.ts <storeId>
 *
 * Não altera nada no banco — só leitura.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Esse script roda fora do Nest (ts-node puro), então o ConfigModule não
// carrega o .env sozinho — precisamos ler o backend/.env na mão antes de
// montar o adapter do Prisma (mesmo espírito do loader do test-token.ts).
function loadEnvFile(path: string): Record<string, string> {
    if (!existsSync(path)) return {};

    const content = readFileSync(path, 'utf-8');
    const result: Record<string, string> = {};

    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) continue;

        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        result[key] = value;
    }

    return result;
}

const envFromFile = loadEnvFile(join(__dirname, '..', '..', '.env'));
for (const [key, value] of Object.entries(envFromFile)) {
    if (!process.env[key]) process.env[key] = value;
}

const BRT_OFFSET_HOURS = 3;
const BUSINESS_DAY_START_HOUR = 8;

function businessDayKey(utcDate: Date): string {
    const brt = new Date(utcDate.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
    if (brt.getUTCHours() < BUSINESS_DAY_START_HOUR) {
        brt.setUTCDate(brt.getUTCDate() - 1);
    }
    return brt.toISOString().slice(0, 10);
}

function calendarDayKey(utcDate: Date): string {
    return utcDate.toISOString().slice(0, 10);
}

async function main() {
    const storeId = process.argv[2];

    if (!storeId) {
        console.error('Uso: npx ts-node scripts/meep/debug-items.ts <storeId>');
        process.exit(1);
    }

    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL não encontrado (nem no ambiente, nem no backend/.env).');
        process.exit(1);
    }

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });

    try {
        const orders = await prisma.meepOrder.findMany({
            where: { storeId },
            select: {
                id: true,
                meepOrderId: true,
                orderDateUtc: true,
                lastSyncedFrom: true,
                _count: { select: { items: true } },
            },
            orderBy: { orderDateUtc: 'asc' },
        });

        console.log(`Total de MeepOrder pra storeId=${storeId}: ${orders.length}\n`);

        if (orders.length === 0) {
            console.log('Nenhum pedido no banco pra essa loja. O sync ainda não gravou nada.');
            return;
        }

        const byCalendarDay = new Map<string, number>();
        const byBusinessDay = new Map<string, number>();
        let ordersWithoutItems = 0;

        for (const order of orders) {
            const cal = calendarDayKey(order.orderDateUtc);
            const biz = businessDayKey(order.orderDateUtc);

            byCalendarDay.set(cal, (byCalendarDay.get(cal) ?? 0) + 1);
            byBusinessDay.set(biz, (byBusinessDay.get(biz) ?? 0) + 1);

            if (order._count.items === 0) ordersWithoutItems++;
        }

        console.log('--- Pedidos por DIA DE CALENDÁRIO (UTC, orderDateUtc bruto) ---');
        for (const [day, count] of [...byCalendarDay.entries()].sort()) {
            console.log(`  ${day}: ${count} pedido(s)`);
        }

        console.log('\n--- Pedidos por DIA COMERCIAL (08h-04h Brasília) ---');
        for (const [day, count] of [...byBusinessDay.entries()].sort()) {
            console.log(`  ${day}: ${count} pedido(s)`);
        }

        console.log(`\nPedidos SEM nenhum item vinculado: ${ordersWithoutItems} de ${orders.length}`);

        console.log('\n--- 3 pedidos mais antigos ---');
        for (const o of orders.slice(0, 3)) {
            console.log(
                `  ${o.meepOrderId} | orderDateUtc=${o.orderDateUtc.toISOString()} | itens=${o._count.items} | fonte=${o.lastSyncedFrom}`,
            );
        }

        console.log('\n--- 3 pedidos mais recentes ---');
        for (const o of orders.slice(-3)) {
            console.log(
                `  ${o.meepOrderId} | orderDateUtc=${o.orderDateUtc.toISOString()} | itens=${o._count.items} | fonte=${o.lastSyncedFrom}`,
            );
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Erro:', error);
    process.exit(1);
});
