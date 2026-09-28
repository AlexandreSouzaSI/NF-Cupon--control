import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PASSWORD_RESET_REQUESTED_EMAIL_EVENT } from '../common/events';
import type { PasswordResetRequestedEmailEvent } from '../common/events';
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
}
