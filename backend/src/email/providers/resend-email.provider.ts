import { Logger } from '@nestjs/common';
import type { EmailProvider, EmailSendResult } from '../email-provider.interface';

// Cliente mínimo da API do Resend via fetch puro — sem SDK extra, mesmo
// padrão do EvolutionWhatsappProvider (whatsapp/providers). Precisa de
// RESEND_API_KEY e RESEND_FROM_EMAIL no .env (ver .env.example).
//
// Atenção: enquanto o domínio de RESEND_FROM_EMAIL não estiver verificado
// no painel do Resend, a conta em modo sandbox só consegue mandar e-mail
// pro próprio endereço cadastrado na Resend — pra mandar de verdade pra
// qualquer usuário, é preciso verificar um domínio próprio lá.
export class ResendEmailProvider implements EmailProvider {
    private readonly logger = new Logger(ResendEmailProvider.name);
    private readonly apiKey: string;
    private readonly from: string;

    constructor() {
        this.apiKey = process.env.RESEND_API_KEY as string;
        this.from = process.env.RESEND_FROM_EMAIL as string;
    }

    async sendEmail(params: {
        to: string;
        subject: string;
        text: string;
    }): Promise<EmailSendResult> {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                from: this.from,
                to: [params.to],
                subject: params.subject,
                text: params.text,
            }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            this.logger.warn(
                `Resend respondeu ${response.status}: ${JSON.stringify(data)}`,
            );
            throw new Error(
                data?.message || `Resend respondeu ${response.status}`,
            );
        }

        return { providerMessageId: data?.id };
    }
}
