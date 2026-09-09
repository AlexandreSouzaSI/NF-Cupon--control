import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

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

    const lojaAnchieta = await prisma.store.upsert({
        where: { id: 'loja-anchieta' },
        update: {},
        create: {
            id: 'loja-anchieta',
            name: 'Loja Anchieta',
        },
    });

    const lojaEldorado = await prisma.store.upsert({
        where: { id: 'loja-eldorado' },
        update: {},
        create: {
            id: 'loja-eldorado',
            name: 'Loja Eldorado',
        },
    });

    const lojaContagem = await prisma.store.upsert({
        where: { id: 'loja-contagem' },
        update: {},
        create: {
            id: 'loja-contagem',
            name: 'Loja Contagem',
        },
    });

    // Loja de demonstração pública — destino de todo autocadastro em
    // /demo (botão "Cadastre-se para teste" na tela de login). isDemo:
    // true é o que o endpoint de signup usa pra achar essa loja; o dono
    // não fica vinculado a ela (não é uma loja "de verdade" do negócio).
    await prisma.store.upsert({
        where: { id: 'loja-demo-amsx' },
        update: { isDemo: true },
        create: {
            id: 'loja-demo-amsx',
            name: 'AMSX Teste',
            isDemo: true,
        },
    });

    const stores = [lojaAnchieta, lojaEldorado, lojaContagem];

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
