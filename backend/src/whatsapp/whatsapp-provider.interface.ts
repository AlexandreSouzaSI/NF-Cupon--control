// Contrato mínimo que qualquer provedor de WhatsApp precisa cumprir.
// Trocar de provedor (Z-API, Evolution API, Meta Cloud API, ou qualquer
// outro) é só criar uma classe nova implementando essa interface e trocar
// o `useClass` em whatsapp.module.ts — nada em WhatsappService ou nos
// outros módulos precisa mudar.
export type WhatsappSendResult = {
    providerMessageId?: string;
};

export interface WhatsappProvider {
    sendText(toPhone: string, text: string): Promise<WhatsappSendResult>;
}

// Token de injeção — permite trocar a implementação real sem o resto do
// código depender de uma classe concreta.
export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';
