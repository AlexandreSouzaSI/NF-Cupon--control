import {
    ConflictException,
    ForbiddenException,
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

// Depois que o teste de um IP vence, quanto tempo esse mesmo IP fica
// impedido de criar outra conta de teste nova (senão bastava recarregar a
// página e cadastrar outro e-mail pra ganhar mais 1h na hora).
const IP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DemoService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async signup(dto: DemoSignupDto, ip: string) {
        const emailExists = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (emailExists) {
            throw new ConflictException('E-mail já cadastrado.');
        }

        await this.ensureIpNotOnCooldown(ip);

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

        await this.prisma.user.updateMany({
            where: { id: { in: expiredUsers.map((user) => user.id) } },
            data: { active: false },
        });

        console.log(
            `[demo] ${expiredUsers.length} teste(s) grátis expirado(s) — loja e conta desativadas.`,
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

    private async ensureIpNotOnCooldown(ip: string) {
        if (!ip) return;

        const lastFromIp = await this.prisma.user.findFirst({
            where: { isDemo: true, signupIp: ip },
            orderBy: { createdAt: 'desc' },
        });

        if (!lastFromIp) return;

        const now = new Date();
        const cooldownEnds = new Date(
            lastFromIp.createdAt.getTime() + IP_COOLDOWN_MS,
        );

        if (now >= cooldownEnds) return;

        const stillActive =
            lastFromIp.demoExpiresAt && now < lastFromIp.demoExpiresAt;

        if (stillActive) {
            throw new ForbiddenException(
                'Já existe um teste em andamento nesse endereço. Faça login com a conta que você acabou de criar.',
            );
        }

        const hoursLeft = Math.ceil(
            (cooldownEnds.getTime() - now.getTime()) / (60 * 60 * 1000),
        );

        throw new ForbiddenException(
            `O teste grátis desse endereço já foi usado. Tente de novo em cerca de ${hoursLeft}h.`,
        );
    }
}
