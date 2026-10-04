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

// Depois que o teste de 1h vence, a conta NÃO some na hora: fica "vencida
// mas recuperável" por esse prazo, pra pessoa conseguir entrar, conhecer os
// planos e pagar (ver billing.service.ts, convertTrialToReal). Passado o
// prazo, quem nunca assinou é desativado como antes e o e-mail é liberado
// pra um novo teste. Colocar 0 volta ao comportamento antigo (desativa
// 1h depois, sem janela de recuperação).
const TRIAL_RECOVERY_GRACE_DAYS = 7;

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
            const expired =
                emailExists.isDemo &&
                emailExists.demoExpiresAt &&
                emailExists.demoExpiresAt < new Date();

            throw new ConflictException(
                expired
                    ? 'O teste grátis desse e-mail já acabou. Entre com a sua senha para conhecer os planos e continuar usando.'
                    : 'Esse e-mail já tem um teste em andamento agora. Entre com a conta já criada.',
            );
        }

        const password = await bcrypt.hash(dto.password, 10);
        const now = new Date();
        const demoExpiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);
        const displayName = dto.name?.trim() || 'Visitante';

        // Multi-tenant: Store.empresaId é obrigatório, mas o teste grátis
        // não é "de" nenhuma empresa-cliente real — todas as lojas de teste
        // ficam agrupadas numa empresa guarda-chuva só pra isso (nunca
        // aparece pra ninguém, é só pra satisfazer a constraint e manter as
        // lojas de teste juntas caso precise auditar/limpar em massa).
        const empresaDemo = await this.prisma.empresa.upsert({
            where: { id: 'empresa-demo' },
            update: {},
            create: {
                id: 'empresa-demo',
                name: 'Testes grátis (demo)',
                adminNotes:
                    'Empresa guarda-chuva pras lojas descartáveis do /demo/signup — nunca é uma empresa-cliente de verdade.',
            },
        });

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
                empresaId: empresaDemo.id,
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
    // app.module.ts) — faz a limpeza de testes que ninguém assinou. Quando
    // o teste de 1h vence, a conta continua ativa (só fica restrita a
    // planos/cobrança, ver jwt.strategy.ts) durante TRIAL_RECOVERY_GRACE_DAYS;
    // só depois desse prazo desativa o usuário e a loja de teste. Quem tem
    // assinatura (Subscription) ligada à conta de teste NUNCA é limpo aqui:
    // ou já virou conta real no pagamento, ou está com o checkout em
    // andamento. Desativar (não apagar de verdade) segue o padrão do
    // sistema e evita erro de chave estrangeira em Compra/Tarefa/Perda etc.
    @Cron(CronExpression.EVERY_5_MINUTES)
    async cleanupExpiredTrials() {
        const now = new Date();
        const cutoff = new Date(
            now.getTime() - TRIAL_RECOVERY_GRACE_DAYS * 24 * 60 * 60 * 1000,
        );

        const candidates = await this.prisma.user.findMany({
            where: {
                isDemo: true,
                active: true,
                demoExpiresAt: { lt: cutoff },
            },
            include: {
                userStores: { select: { storeId: true } },
            },
        });

        // Conta de teste com assinatura (qualquer status exceto cancelada)
        // fica de fora da limpeza.
        const withSubscription = candidates.length
            ? await this.prisma.subscription.findMany({
                where: {
                    trialUserId: { in: candidates.map((user) => user.id) },
                    status: { not: 'CANCELED' },
                },
                select: { trialUserId: true },
            })
            : [];

        const protectedIds = new Set(
            withSubscription.map((item) => item.trialUserId),
        );

        const expiredUsers = candidates.filter(
            (user) => !protectedIds.has(user.id),
        );

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
            `[demo] ${expiredUsers.length} teste(s) grátis sem assinatura passaram da janela de recuperação — loja desativada e e-mail liberado pra repetir.`,
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
