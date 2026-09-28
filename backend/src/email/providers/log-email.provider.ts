import { Logger } from '@nestjs/common';
import type { EmailProvider, EmailSendResult } from '../email-provider.interface';

// Fallback quando RESEND_API_KEY/RESEND_FROM_EMAIL não estão configurados
// — só loga, não manda nada de verdade. Mesma ideia do LogWhatsappProvider
// (whatsapp/providers), pra nunca quebrar o resto do sistema por falta de
// configuração de e-mail.
export class LogEmailProvider implements EmailProvider {
    private readonly logger = new Logger(LogEmailProvider.name);

    async sendEmail(params: {
        to: string;
        subject: string;
        text: string;
    }): Promise<EmailSendResult> {
        this.logger.warn(
            `[E-mail não enviado — sem provedor configurado] Para: ${params.to} | Assunto: ${params.subject}\n${params.text}`,
        );

        return {};
    }
}
