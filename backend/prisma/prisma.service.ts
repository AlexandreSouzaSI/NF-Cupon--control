import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy {
    constructor() {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL!,
        });

        super({
            adapter,
            // Segurança: senha (hash) e tokens de ativação/troca de senha
            // NUNCA saem do banco por padrão — nem em listas de usuários,
            // nem em include de relação. Quem precisa (login) pede com
            // `omit: { password: false }`.
            omit: {
                user: { password: true, passwordResetToken: true, activationToken: true },
            },
        });
    }

    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }
}