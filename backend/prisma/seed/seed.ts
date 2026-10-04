import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { seedCatalogoPadrao } from './seed-catalogo-padrao';

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
    adapter,
});

// Só dígitos, com DDI 55 na frente — mesma normalização usada em
// users.service.ts e whatsapp.service.ts, duplicada aqui só porque o seed
// roda fora do Nest (sem acesso ao resto do módulo).
function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) return digits;
    return `55${digits}`;
}

async function main() {
    // Ninguém se cadastra sozinho nesse sistema — toda conta é criada por
    // Proprietário/Administrativo/Gerente dentro do app (Cadastros →
    // Usuários). O seed só garante a conta inicial do dono, pra sempre ter
    // como entrar e cadastrar o resto do time a partir dela.
    const ownerPassword = await bcrypt.hash('92988096', 10);

    const owner = await prisma.user.upsert({
        where: { email: 'alemourasouza33@gmail.com' },
        update: {
            role: UserRole.PROPRIETARIO,
            phone: normalizePhone('31975805400'),
            isAdminMaster: true,
        },
        create: {
            name: 'Alexandre',
            email: 'alemourasouza33@gmail.com',
            password: ownerPassword,
            phone: normalizePhone('31975805400'),
            role: UserRole.PROPRIETARIO,
            isAdminMaster: true,
        },
    });

    // Multi-tenant: Store.empresaId é obrigatório desde a 2ª migração — toda
    // loja precisa nascer já vinculada a uma empresa. O seed usa a mesma
    // empresa "Nugalho" do backfill (mesmo id fixo 'empresa-nugalho'), pra
    // ficar consistente com bancos que já rodaram o backfill manualmente.
    const empresaNugalho = await prisma.empresa.upsert({
        where: { id: 'empresa-nugalho' },
        // Nugalho é a empresa do dono do sistema: nunca vê planos nem é
        // bloqueada por cobrança (Empresa.planExempt).
        update: { planExempt: true },
        create: {
            id: 'empresa-nugalho',
            name: 'Nugalho',
            planExempt: true,
        },
    });

    const lojaAnchieta = await prisma.store.upsert({
        where: { id: 'loja-anchieta' },
        update: {},
        create: {
            id: 'loja-anchieta',
            name: 'Loja Anchieta',
            empresaId: empresaNugalho.id,
        },
    });

    const lojaContagem = await prisma.store.upsert({
        where: { id: 'loja-contagem' },
        update: {},
        create: {
            id: 'loja-contagem',
            name: 'Loja Contagem',
            empresaId: empresaNugalho.id,
        },
    });

    // Raiz NÃO é criada por id fixo aqui de propósito: como Store.id é
    // uuid() gerado na criação (não uma string previsível como
    // 'loja-anchieta'/'loja-contagem' acima), uma loja Raiz cadastrada à
    // mão em Cadastros → Lojas antes desse seed existir tem um id
    // aleatório — o upsert por id fixo não encontrava ela e criava uma
    // SEGUNDA "Loja Raiz" duplicada. Por isso: só usa a que já existir com
    // esse nome; se não existir nenhuma ainda, cria uma nova (única vez).
    const lojaRaizExistente = await prisma.store.findFirst({
        where: { name: { in: ['Raiz', 'Loja Raiz'] } },
    });

    const lojaRaiz =
        lojaRaizExistente ??
        (await prisma.store.create({
            data: { name: 'Loja Raiz', empresaId: empresaNugalho.id },
        }));

    // Loja fixa de uma versão anterior do autocadastro de teste — hoje
    // cada cadastro em /demo cria a própria loja isolada na hora (ver
    // demo.service.ts), então essa aqui ficou sem uso. Só desativa, não
    // apaga (mesmo padrão do resto do sistema), pra sumir de Cadastros →
    // Lojas sem risco de derrubar algo que dependa dela.
    await prisma.store.upsert({
        where: { id: 'loja-demo-amsx' },
        update: { active: false },
        create: {
            id: 'loja-demo-amsx',
            name: 'AMSX Teste (desativada)',
            isDemo: true,
            active: false,
            empresaId: empresaNugalho.id,
        },
    });

    const stores = [lojaAnchieta, lojaRaiz, lojaContagem];

    for (const store of stores) {
        await prisma.userStore.upsert({
            where: {
                userId_storeId: {
                    userId: owner.id,
                    storeId: store.id,
                },
            },
            update: {},
            create: {
                userId: owner.id,
                storeId: store.id,
            },
        });
    }

    await prisma.card.upsert({
        where: { id: 'cartao-anchieta-001' },
        update: {},
        create: {
            id: 'cartao-anchieta-001',
            name: 'Cartão Principal Anchieta',
            lastDigits: '0001',
            holderName: 'Empresa',
            storeId: lojaAnchieta.id,
        },
    });

    // Corrige contas de teste que ficaram travadas: antes do
    // cleanupExpiredTrials liberar o e-mail (demo.service.ts), o teste
    // vencido só ficava com active:false, sem soltar o e-mail — aí o
    // @unique bloqueava pra sempre um cadastro novo com aquele e-mail
    // (mesmo a conta estando desativada). Roda sempre, mas só mexe em
    // quem ainda está com o e-mail original (idempotente).
    const stuckDemoUsers = await prisma.user.findMany({
        where: {
            isDemo: true,
            active: false,
            email: { not: { endsWith: '@retirado.local' } },
        },
    });

    for (const stuckUser of stuckDemoUsers) {
        await prisma.user.update({
            where: { id: stuckUser.id },
            data: { email: `demo-expirado-${stuckUser.id}@retirado.local` },
        });
    }

    if (stuckDemoUsers.length > 0) {
        console.log(
            `Corrigido ${stuckDemoUsers.length} conta(s) de teste travada(s) — e-mail liberado pra cadastro novo.`,
        );
    }

    // Recria Estoque + Ficha Técnica de Anchieta/Contagem a partir do
    // catálogo padrão exportado antes do último zero-a-zero do banco (ver
    // prisma/scripts/export-catalogo-padrao.ts) — Raiz não tem catálogo
    // padrão ainda, nasce vazia.
    await seedCatalogoPadrao(prisma, {
        ANCHIETA: lojaAnchieta.id,
        CONTAGEM: lojaContagem.id,
    });

    console.log('Seed executado com sucesso.');
    console.log('Login: alemourasouza33@gmail.com');
    console.log('Senha: 92988096');
    console.log(
        'Esse é o único login criado pelo seed — o resto do time precisa ser cadastrado por essa conta em Cadastros → Usuários.',
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
