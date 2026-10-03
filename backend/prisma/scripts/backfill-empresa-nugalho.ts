import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Rodou UMA VEZ, entre a 1ª migração (Empresa/Store.empresaId/
// User.empresaId todos opcionais) e a 2ª migração (Store.empresaId virou
// obrigatório). Histórico — mantido no repo pra documentar como os dados
// antigos foram migrados, mas o trecho que vinculava Store não type-checka
// mais desde que empresaId passou a ser obrigatório (não dá mais pra
// filtrar `where: { empresaId: null }` numa coluna NOT NULL) — e também não
// tem mais o que fazer, porque não existe mais loja sem empresa possível.
// Se um dia precisar rodar de novo num banco que nunca passou pelo
// backfill original, rode a 1ª migração isolada, rode este script (só a
// parte de User ainda funciona), e só depois aplique a migração que torna
// Store.empresaId obrigatório.
//
// Fase 5 acrescentou o mesmo backfill pra 4 cadastros que eram globais —
// Supplier, SupplierCategory, BillCategory e PaymentBatchConfig — que só
// então ganharam empresaId (nullable). Rodou uma vez (confirmado: 18
// fornecedores, 2 categorias de fornecedor, 2 categorias de conta a pagar,
// 0 config de lote), e a Fase 6 tornou esses 4 campos obrigatórios também
// — mesma situação do Store acima: esse trecho não type-checka mais (não
// dá pra filtrar `where: { empresaId: null }` numa coluna NOT NULL) e não
// tem mais o que fazer, porque não existe mais linha sem empresa possível
// nesses 4 modelos.
//
// O que faz hoje:
// 1. Cria (ou reaproveita, se já existir) a empresa "Nugalho".
// 2. Vincula a ela TODOS os usuários que ainda não têm empresaId — EXCETO
//    contas isAdminMaster=true (essas devem continuar com empresaId nulo,
//    é assim que elas enxergam todas as empresas no painel /admin).
//
// Uso: dentro de backend/:
//   npx ts-node prisma/scripts/backfill-empresa-nugalho.ts
//
// Idempotente: pode rodar mais de uma vez sem duplicar nada (só afeta
// linhas com empresaId ainda nulo).

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    const empresa = await prisma.empresa.upsert({
        where: { id: 'empresa-nugalho' },
        update: {},
        create: {
            id: 'empresa-nugalho',
            name: 'Nugalho',
        },
    });

    const users = await prisma.user.updateMany({
        where: {
            empresaId: null,
            isAdminMaster: false,
        },
        data: { empresaId: empresa.id },
    });

    console.log(`Empresa "Nugalho" (id: ${empresa.id}) pronta.`);
    console.log(`Usuários vinculados: ${users.count}`);
    console.log(
        'Lojas: não mexe mais aqui — Store.empresaId já é obrigatório, então toda loja já nasce com empresa.',
    );
    console.log(
        'Fornecedores/Categorias de fornecedor/Categorias de conta a pagar/Config de lote: não mexe mais aqui — todos já são obrigatórios (empresaId), então já nascem com empresa.',
    );
    console.log(
        'Contas isAdminMaster (ex.: a sua) ficam de propósito sem empresaId.',
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
