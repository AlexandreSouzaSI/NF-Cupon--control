import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../prisma/prisma.service';

async function main() {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    try {
        const prisma = app.get(PrismaService);
        const order = await prisma.meepOrder.findFirst({
            where: { storeId: 'loja-contagem' },
            orderBy: { orderDateUtc: 'desc' },
        });
        if (!order) {
            console.log('Nenhum pedido encontrado.');
            return;
        }
        const raw: any = order.rawJson;
        console.log('Chaves do pedido raw:', Object.keys(raw));
        const itens = raw.Itens || [];
        if (itens.length > 0) {
            console.log('Chaves do primeiro item:', Object.keys(itens[0]));
            console.log(JSON.stringify(itens[0], null, 2));
        } else {
            console.log('Pedido sem itens.');
        }
    } finally {
        await app.close();
        process.exit(0);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
