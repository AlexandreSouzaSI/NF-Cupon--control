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

async function main() {
    const password = await bcrypt.hash('123456', 10);

    const admin = await prisma.user.upsert({
        where: { email: 'admin@compras.com' },
        update: { role: UserRole.ADMINISTRATIVO },
        create: {
            name: 'Administrador',
            email: 'admin@compras.com',
            password,
            role: UserRole.ADMINISTRATIVO,
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

    const stores = [lojaAnchieta, lojaEldorado, lojaContagem];

    for (const store of stores) {
        await prisma.userStore.upsert({
            where: {
                userId_storeId: {
                    userId: admin.id,
                    storeId: store.id,
                },
            },
            update: {},
            create: {
                userId: admin.id,
                storeId: store.id,
            },
        });
    }

    const demoUsers: {
        name: string;
        email: string;
        role: UserRole;
        storeIds: string[];
    }[] = [
        {
            name: 'Proprietário Demo',
            email: 'proprietario@compras.com',
            role: UserRole.PROPRIETARIO,
            storeIds: stores.map((store) => store.id),
        },
        {
            name: 'Gerente Demo',
            email: 'gerente@compras.com',
            role: UserRole.GERENTE,
            storeIds: [lojaAnchieta.id],
        },
        {
            name: 'Comprador Demo',
            email: 'comprador@compras.com',
            role: UserRole.COMPRADOR,
            storeIds: [lojaAnchieta.id],
        },
        {
            name: 'Estoquista Demo',
            email: 'estoquista@compras.com',
            role: UserRole.ESTOQUISTA,
            storeIds: [lojaAnchieta.id],
        },
        {
            name: 'Financeiro Demo',
            email: 'financeiro@compras.com',
            role: UserRole.FINANCEIRO,
            storeIds: [lojaAnchieta.id],
        },
    ];

    for (const demoUser of demoUsers) {
        const user = await prisma.user.upsert({
            where: { email: demoUser.email },
            update: { role: demoUser.role },
            create: {
                name: demoUser.name,
                email: demoUser.email,
                password,
                role: demoUser.role,
            },
        });

        for (const storeId of demoUser.storeIds) {
            await prisma.userStore.upsert({
                where: {
                    userId_storeId: {
                        userId: user.id,
                        storeId,
                    },
                },
                update: {},
                create: {
                    userId: user.id,
                    storeId,
                },
            });
        }
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
    console.log('Senha para todos os usuários demo: 123456');
    console.log('Login administrativo: admin@compras.com');
    console.log('Login proprietário: proprietario@compras.com');
    console.log('Login gerente: gerente@compras.com');
    console.log('Login comprador: comprador@compras.com');
    console.log('Login estoquista: estoquista@compras.com');
    console.log('Login financeiro: financeiro@compras.com');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });