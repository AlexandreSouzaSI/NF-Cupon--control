import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Marca a(s) empresa(s) Nugalho como isentas de planos (Empresa.planExempt):
// nunca veem "Planos", nunca recebem cobrança e nunca são bloqueadas por
// falta de pagamento. Rodar UMA VEZ depois da migração que criou a coluna
// (o seed também já grava planExempt:true pra 'empresa-nugalho' em bancos
// novos).
//
// Identifica por nome contendo "nugalho" (qualquer caixa) — OU pelo id fixo
// 'empresa-nugalho' usado pelo seed/backfill de multi-tenant.
//
// Uso (dentro de backend/):
//   npx ts-node prisma/scripts/backfill-plan-exempt.ts
//
// Idempotente. Imprime as empresas afetadas pra você conferir; se alguma
// empresa-cliente de verdade tiver "nugalho" no nome por engano, desmarque
// em /admin (campo planExempt) ou ajuste o filtro abaixo.

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    const matches = await prisma.empresa.findMany({
        where: {
            OR: [
                { name: { contains: 'nugalho', mode: 'insensitive' } },
                { id: 'empresa-nugalho' },
            ],
        },
        select: { id: true, name: true, planExempt: true },
    });

    if (matches.length === 0) {
        console.log(
            'Nenhuma empresa com "Nugalho" no nome encontrada. Nada a fazer.',
        );
        return;
    }

    const result = await prisma.empresa.updateMany({
        where: { id: { in: matches.map((empresa) => empresa.id) } },
        data: { planExempt: true },
    });

    for (const empresa of matches) {
        console.log(
            `- ${empresa.name} (${empresa.id}) ${empresa.planExempt ? 'já era isenta' : '-> isenta'}`,
        );
    }

    console.log(`Empresas marcadas como planExempt: ${result.count}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
