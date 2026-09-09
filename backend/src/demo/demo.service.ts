import {
    ConflictException,
    Injectable,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DemoSignupDto } from './dto/demo-signup.dto';

// Duração do teste grátis, a partir do momento do cadastro.
const TRIAL_DURATION_MS = 60 * 60 * 1000;

@Injectable()
export class DemoService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async signup(dto: DemoSignupDto, ip: string) {
        // Só barra se já tiver um teste ATIVO com esse e-mail agora — uma
        // vez que o teste anterior expira (cleanupExpiredTrials libera o
        // e-mail original, ver abaixo), a mesma pessoa pode cadastrar de
        // novo à vontade. Sem cooldown por IP: a ideia agora é deixar
        // testar, expirar sozinho em 1h, e permitir repetir sem fricção.
        const emailExists = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (emailExists) {
            throw new ConflictException(
                'Esse e-mail já tem um teste em andamento agora. Aguarde ele expirar (1h) ou entre com a conta já criada.',
            );
        }

        const password = await bcrypt.hash(dto.password, 10);
        const now = new Date();
        const demoExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);
        const displayName = dto.name?.trim() || 'Visitante';

        // Cada teste ganha a própria loja, nova e vazia — ninguém vê o que
        // outro tester cadastrou, e o isolamento reaproveita o mesmo filtro
        // por loja que já vale pro resto do sistema (ver hasGlobalStoreAccess
        // em users.service.ts/stores.service.ts). isDemo:true é o que
        // identifica essa loja como descartável pro cleanupExpiredTrials
        // abaixo — nunca mexe numa loja de verdade.
        const store = await this.prisma.store.create({
            data: {
                name: `Teste — ${displayName}`,
                isDemo: true,
            },
        });

        const user = await this.prisma.user.create({
            data: {
                name: displayName,
                email: dto.email,
                password,
                role: UserRole.GERENTE,
                isDemo: true,
                demoExpiresAt,
                signupIp: ip,
                active: true,
                userStores: {
                    create: {
                        storeId: store.id,
                    },
                },
            },
        });

        return this.buildLoginResponse(user, [{ id: store.id, name: store.name }]);
    }

    // Roda sozinho a cada 5min (ScheduleModule já é global, ver
    // app.module.ts) — desativa quem passou de 1h de teste junto com a
    // loja que foi criada só pra essa pessoa. Desativar (não apagar de
    // verdade) segue o mesmo padrão do resto do sistema (remove() de
    // usuário/loja também só marca active:false) e evita qualquer risco de
    // erro de chave estrangeira ao tentar apagar linhas de Compra/Tarefa/
    // Perda/etc. que a pessoa tenha criado durante o teste.
    @Cron(CronExpression.EVERY_5_MINUTES)
    async cleanupExpiredTrials() {
        const now = new Date();

        const expiredUsers = await this.prisma.user.findMany({
            where: {
                isDemo: true,
                active: true,
                demoExpiresAt: { lt: now },
            },
            include: {
                userStores: { select: { storeId: true } },
            },
        });

        if (expiredUsers.length === 0) return;

        const storeIds = Array.from(
            new Set(
                expiredUsers.flatMap((user) =>
                    user.userStores.map((item) => item.storeId),
                ),
            ),
        );

        if (storeIds.length > 0) {
            await this.prisma.store.updateMany({
                where: { id: { in: storeIds }, isDemo: true },
                data: { active: false },
            });
        }

        // Libera o e-mail original pra pessoa poder testar de novo sem
        // fricção nenhuma — sem isso o @unique do e-mail bloquearia pra
        // sempre, mesmo com a conta já desativada. O e-mail retirado (com
        // o id embutido) nunca colide com um cadastro novo.
        for (const user of expiredUsers) {
            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    active: false,
                    email: `demo-expirado-${user.id}@retirado.local`,
                },
            });
        }

        console.log(
            `[demo] ${expiredUsers.length} teste(s) grátis expirado(s) — loja desativada e e-mail liberado pra repetir.`,
        );
    }

    // Mesmo formato de resposta do /auth/login (auth.service.ts) — o
    // frontend usa o mesmo helper de salvar token/user pra ambos.
    private async buildLoginResponse(
        user: {
            id: string;
            name: string;
            email: string;
            role: UserRole;
            isAdminMaster: boolean;
            isDemo: boolean;
            demoExpiresAt: Date | null;
        },
        stores: { id: string; name: string }[],
    ) {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };

        return {
            access_token: await this.jwtService.signAsync(payload),
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                isAdminMaster: user.isAdminMaster,
                isDemo: user.isDemo,
                demoExpiresAt: user.demoExpiresAt,
                stores,
            },
        };
    }
}
