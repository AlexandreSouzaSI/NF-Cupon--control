// Contrato mínimo que qualquer provedor de e-mail precisa cumprir — mesmo
// espírito do WhatsappProvider (src/whatsapp/whatsapp-provider.interface.ts):
// trocar de provedor é só criar uma classe nova e trocar o `useFactory` em
// email.module.ts, nada em EmailService precisa mudar.
export type EmailSendResult = {
    providerMessageId?: string;
};

export interface EmailProvider {
    sendEmail(params: {
        to: string;
        subject: string;
        text: string;
    }): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';
