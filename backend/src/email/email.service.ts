import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
    PASSWORD_RESET_REQUESTED_EMAIL_EVENT,
    ACCOUNT_ACTIVATION_INVITE_EMAIL_EVENT,
} from '../common/events';
import type {
    PasswordResetRequestedEmailEvent,
    AccountActivationInviteEmailEvent,
} from '../common/events';
import { EMAIL_PROVIDER } from './email-provider.interface';
import type { EmailProvider } from './email-provider.interface';

// De propósito sem import de nenhum módulo de domínio — só ouve eventos
// (EventEmitter2, global), mesmo espírito do WhatsappModule (ver
// src/whatsapp/whatsapp.module.ts e src/common/events.ts).
@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    constructor(@Inject(EMAIL_PROVIDER) private provider: EmailProvider) { }

    // Conta: link único de "esqueci minha senha", quando a pessoa escolhe
    // receber por e-mail em vez de WhatsApp.
    @OnEvent(PASSWORD_RESET_REQUESTED_EMAIL_EVENT)
    async handlePasswordResetRequestedEmail(
        payload: PasswordResetRequestedEmailEvent,
    ) {
        const text = [
            `${payload.name}, aqui está o link pra criar uma nova senha (válido por 1 hora):`,
            '',
            payload.link,
            '',
            'Se você não pediu isso, pode ignorar essa mensagem.',
        ].join('\n');

        try {
            await this.provider.sendEmail({
                to: payload.email,
                subject: 'Redefinir sua senha',
                text,
            });
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar e-mail de redefinição de senha pra ${payload.email}: ${error?.message || error}`,
            );
        }
    }

    // Conta: convite de boas-vindas (criar a primeira senha) por e-mail —
    // manda sempre que um usuário é criado sem senha, além do WhatsApp
    // (quando tem telefone), pra garantir que o convite chegue em algum
    // canal mesmo sem Evolution API configurada. Ver
    // src/users/users.service.ts#create.
    @OnEvent(ACCOUNT_ACTIVATION_INVITE_EMAIL_EVENT)
    async handleAccountActivationInviteEmail(
        payload: AccountActivationInviteEmailEvent,
    ) {
        const text = [
            `${payload.name}, sua conta no Galho Hub foi criada.`,
            '',
            `Crie sua senha por aqui (link válido por 7 dias):`,
            payload.link,
            '',
            'Se você não esperava esse e-mail, pode ignorá-lo.',
        ].join('\n');

        try {
            await this.provider.sendEmail({
                to: payload.email,
                subject: 'Crie sua senha — Galho Hub',
                text,
            });
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar e-mail de convite de ativação pra ${payload.email}: ${error?.message || error}`,
            );
        }
    }
}
