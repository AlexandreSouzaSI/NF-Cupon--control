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
        update: {},
        create: {
            name: 'Administrador',
            email: 'admin@compras.com',
            password,
            role: UserRole.ADMIN,
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
    console.log('Login: admin@compras.com');
    console.log('Senha: 123456');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });