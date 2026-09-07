import { Injectable, Logger } from '@nestjs/common';

import {
    WhatsappProvider,
    WhatsappSendResult,
} from '../whatsapp-provider.interface';

// Provedor padrão enquanto nenhum provedor real (Z-API, Evolution API ou
// Meta Cloud API) foi escolhido/configurado — só registra no log o que
// teria sido enviado, sem gastar nada nem depender de conta externa. Assim
// o resto do sistema (Tarefas, o cadastro de telefone etc.) já funciona
// hoje; trocar por um provedor real depois é só implementar
// WhatsappProvider numa classe nova e apontar WHATSAPP_PROVIDER pra ela em
// whatsapp.module.ts.
@Injectable()
export class LogWhatsappProvider implements WhatsappProvider {
    private readonly logger = new Logger('WhatsappProvider(log)');

    async sendText(toPhone: string, text: string): Promise<WhatsappSendResult> {
        this.logger.log(
            `[WhatsApp simulado — nenhum provedor configurado] para ${toPhone}:\n${text}`,
        );

        return { providerMessageId: undefined };
    }
}
