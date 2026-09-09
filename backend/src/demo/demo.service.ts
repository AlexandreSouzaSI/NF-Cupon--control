import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
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
        const store = await this.prisma.store.findFirst({
            where: { isDemo: true, active: true },
        });

        if (!store) {
            throw new NotFoundException(
                'Nenhuma loja de demonstração configurada. Marque uma loja como "loja de demonstração" em Cadastros → Lojas.',
            );
        }

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

        const user = await this.prisma.user.create({
            data: {
                name: dto.name?.trim() || 'Visitante',
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
