import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import { maskEmail, maskPhone } from '../common/mask.util';
import {
    ACCOUNT_ACTIVATION_INVITE_EVENT,
    PASSWORD_RESET_REQUESTED_EMAIL_EVENT,
    PASSWORD_RESET_REQUESTED_WHATSAPP_EVENT,
} from '../common/events';
import { PasswordResetChannel } from './dto/send-password-reset.dto';

// 1h — bem mais curto que o de ativação (7 dias, ver users.service.ts)
// porque é um link que a pessoa pediu agora mesmo, não um convite pra usar
// com calma depois.
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function frontendUrl() {
    return (process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

// Mesmo critério de lib/auth do frontend: "@" no meio do texto identifica
// e-mail, senão é telefone (normalizado antes de comparar).
function findUserWhereByIdentifier(identifier: string) {
    const trimmed = identifier.trim();

    if (trimmed.includes('@')) {
        return { email: trimmed };
    }

    return { phone: normalizePhone(trimmed) };
}

@Injectable()
export class AccountService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
    ) { }

    // Passo 1 da ativação: a tela de "crie sua senha" chama isso só pra
    // confirmar que o link ainda é válido e mostrar o nome da pessoa.
    async getActivationInfo(token: string) {
        const user = await this.findValidActivationUser(token);
        return { name: user.name };
    }

    async activateAccount(token: string, password: string) {
        const user = await this.findValidActivationUser(token);

        const hashed = await bcrypt.hash(password, 10);

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashed,
                accountActivated: true,
                activationToken: null,
                activationTokenExpiresAt: null,
            },
        });

        return { ok: true };
    }

    private async findValidActivationUser(token: string) {
        const user = await this.prisma.user.findUnique({
            where: { activationToken: token },
        });

        if (!user) {
            throw new NotFoundException('Link inválido ou já utilizado.');
        }

        if (
            !user.activationTokenExpiresAt ||
            user.activationTokenExpiresAt < new Date()
        ) {
            throw new BadRequestException(
                'Esse link de ativação expirou. Peça pra alguém do time reenviar o convite.',
            );
        }

        return user;
    }

    // Passo 1 do "esqueci minha senha": a pessoa digita o login (telefone
    // ou e-mail) e a tela mostra os cartões mascarados de pra onde pode
    // mandar o link, sem expor o contato completo.
    async getResetOptions(identifier: string) {
        const user = await this.prisma.user.findFirst({
            where: { ...findUserWhereByIdentifier(identifier), active: true },
        });

        if (!user) {
            return { found: false as const };
        }

        return {
            found: true as const,
            email: user.email ? maskEmail(user.email) : null,
            phone: user.phone ? maskPhone(user.phone) : null,
        };
    }

    // Passo 2: a pessoa escolheu o canal (cartão) — gera o token e manda o
    // link por lá. Não revalida de novo qual card existe: se a pessoa
    // pediu WHATSAPP sem telefone cadastrado, é erro de uso (não deveria
    // acontecer pela UI normal).
    async sendResetLink(identifier: string, channel: PasswordResetChannel) {
        const user = await this.prisma.user.findFirst({
            where: { ...findUserWhereByIdentifier(identifier), active: true },
        });

        if (!user) {
            throw new NotFoundException('Conta não encontrada.');
        }

        if (channel === PasswordResetChannel.WHATSAPP && !user.phone) {
            throw new BadRequestException(
                'Essa conta não tem telefone cadastrado pra receber por WhatsApp.',
            );
        }

        if (channel === PasswordResetChannel.EMAIL && !user.email) {
            throw new BadRequestException(
                'Essa conta não tem e-mail cadastrado pra receber por e-mail.',
            );
        }

        const token = randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: token,
                passwordResetTokenExpiresAt: expiresAt,
            },
        });

        const link = `${frontendUrl()}/redefinir-senha/${token}`;

        if (channel === PasswordResetChannel.WHATSAPP) {
            this.eventEmitter.emit(PASSWORD_RESET_REQUESTED_WHATSAPP_EVENT, {
                userId: user.id,
                name: user.name,
                phone: user.phone as string,
                link,
            });
        } else {
            this.eventEmitter.emit(PASSWORD_RESET_REQUESTED_EMAIL_EVENT, {
                userId: user.id,
                name: user.name,
                email: user.email,
                link,
            });
        }

        return { ok: true };
    }

    async getResetInfo(token: string) {
        const user = await this.findValidResetUser(token);
        return { name: user.name };
    }

    async resetPassword(token: string, password: string) {
        const user = await this.findValidResetUser(token);

        const hashed = await bcrypt.hash(password, 10);

        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashed,
                passwordResetToken: null,
                passwordResetTokenExpiresAt: null,
            },
        });

        return { ok: true };
    }

    private async findValidResetUser(token: string) {
        const user = await this.prisma.user.findUnique({
            where: { passwordResetToken: token },
        });

        if (!user) {
            throw new NotFoundException('Link inválido ou já utilizado.');
        }

        if (
            !user.passwordResetTokenExpiresAt ||
            user.passwordResetTokenExpiresAt < new Date()
        ) {
            throw new BadRequestException(
                'Esse link expirou. Peça um novo em "Esqueci minha senha".',
            );
        }

        return user;
    }
}
