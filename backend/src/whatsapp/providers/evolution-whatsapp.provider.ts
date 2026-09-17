import { Injectable, Logger } from '@nestjs/common';

import {
    WhatsappProvider,
    WhatsappSendResult,
} from '../whatsapp-provider.interface';

// Provedor real usando a Evolution API (self-hosted, open-source —
// github.com/evolution-foundation/evolution-api). Precisa de 3 variáveis
// de ambiente pra funcionar: EVOLUTION_API_URL, EVOLUTION_API_KEY e
// EVOLUTION_INSTANCE (ver .env.example). Sem elas, whatsapp.module.ts cai
// de volta pro LogWhatsappProvider — nunca quebra o resto do sistema.
//
// Chamada real: POST {EVOLUTION_API_URL}/message/sendText/{instance}
// com header "apikey" e body { number, text }. Documentação:
// https://doc.evolution-api.com/v2/api-reference/message-controller/send-text
@Injectable()
export class EvolutionWhatsappProvider implements WhatsappProvider {
    private readonly logger = new Logger('WhatsappProvider(evolution)');
    private readonly baseUrl: string;
    private readonly apiKey: string;
    private readonly instance: string;

    constructor() {
        this.baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/+$/, '');
        this.apiKey = process.env.EVOLUTION_API_KEY || '';
        this.instance = process.env.EVOLUTION_INSTANCE || '';
    }

    async sendText(toPhone: string, text: string): Promise<WhatsappSendResult> {
        const url = `${this.baseUrl}/message/sendText/${this.instance}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: this.apiKey,
            },
            body: JSON.stringify({ number: toPhone, text }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');

            throw new Error(
                `Evolution API respondeu ${response.status}: ${body || 'sem corpo'}`,
            );
        }

        const data = (await response.json().catch(() => ({}))) as any;

        return { providerMessageId: data?.key?.id };
    }
}
