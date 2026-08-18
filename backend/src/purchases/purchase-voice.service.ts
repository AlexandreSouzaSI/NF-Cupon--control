import { BadRequestException, Injectable } from '@nestjs/common';
import { Blob } from 'buffer';

import { PaymentMethod } from '@prisma/client';

// Cadastro de compra por comando de voz: 1) transcreve o áudio (Whisper),
// 2) manda a transcrição pra um modelo de texto extrair fornecedor, forma
// de pagamento e itens em JSON. Não usa nenhuma lib de HTTP nova — só
// fetch/FormData/Blob nativos do Node (mesma filosofia do cliente mTLS da
// Sefaz: zero dependência extra pra falar com uma API HTTP externa).
//
// Exige a variável de ambiente OPENAI_API_KEY (ver backend/.env). Sem ela,
// o endpoint devolve um erro claro em vez de tentar chamar a API sem
// autenticação.

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const PAYMENT_METHODS: PaymentMethod[] = [
    'CREDIT_CARD',
    'CASH',
    'PIX',
    'COMPANY_ACCOUNT',
    'BOLETO',
];

const EXTENSION_BY_MIMETYPE: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
};

export type VoicePurchaseItemDraft = {
    name: string;
    quantity: number;
    unit: string | null;
    unitPrice: number | null;
    total: number | null;
};

export type VoicePurchaseDraft = {
    description: string;
    supplierName: string | null;
    paymentMethod: PaymentMethod | null;
    items: VoicePurchaseItemDraft[];
    notes: string | null;
    informedTotalValue: number | null;
};

const SYSTEM_PROMPT = `Você recebe a transcrição de um áudio em português onde alguém descreve uma compra feita por uma loja (bar/restaurante) pra um sistema de controle de compras. Sua tarefa é extrair os dados da compra e devolver SOMENTE um objeto JSON, sem nenhum texto antes ou depois, seguindo exatamente este formato:

{
  "description": string (curta, resume a compra; se não for dita explicitamente, monte a partir do fornecedor e dos itens),
  "supplierName": string ou null (nome do fornecedor/loja mencionado),
  "paymentMethod": um destes valores exatos ou null: "CREDIT_CARD", "CASH", "PIX", "COMPANY_ACCOUNT", "BOLETO" (mapeie "cartão"/"crédito" -> CREDIT_CARD, "dinheiro"/"espécie" -> CASH, "pix" -> PIX, "boleto" -> BOLETO, "conta da empresa"/"transferência da empresa" -> COMPANY_ACCOUNT; se não for mencionado, null),
  "items": array de objetos { "name": string, "quantity": number, "unit": string ou null (abreviação curta tipo "UN", "KG", "CX", "PCT"), "unitPrice": number ou null (preço de uma unidade/pacote, nunca o total), "total": number ou null (só preencha se o valor total do item foi dito explicitamente, não calcule) },
  "notes": string ou null (observações extras que não couberam nos outros campos),
  "informedTotalValue": number ou null (valor total da compra, SE E SOMENTE SE foi dito um valor total geral separado da soma dos itens; caso contrário null)
}

Regras importantes:
- Números de valor em reais: converta "10 reais" -> 10, "dez reais e cinquenta" -> 10.5. Nunca inclua o símbolo R$ nem "reais" no JSON, só o número.
- Se a pessoa disser "10 pacotes de 5kg por 10 reais", isso é quantity=10, unit="PCT", name deve incluir o peso do pacote (ex.: "Arroz 5kg"), unitPrice=10, total=null (deixe o sistema calcular).
- Nunca invente itens, fornecedor ou valores que não foram ditos.
- Se não conseguir identificar nenhum item, devolva "items": [].
- Responda em português nos campos de texto (description, name, notes).
- Devolva APENAS o JSON, sem markdown, sem comentários.`;

@Injectable()
export class PurchaseVoiceService {
    private getApiKey(): string {
        const key = process.env.OPENAI_API_KEY;

        if (!key) {
            throw new BadRequestException(
                'Cadastro por voz não está configurado neste servidor (falta OPENAI_API_KEY no .env do backend).',
            );
        }

        return key;
    }

    async transcribe(
        buffer: Buffer,
        mimetype: string,
    ): Promise<string> {
        const apiKey = this.getApiKey();

        const extension = EXTENSION_BY_MIMETYPE[mimetype] || 'webm';

        const form = new FormData();

        form.append(
            'file',
            new Blob([buffer], { type: mimetype || 'audio/webm' }) as any,
            `audio.${extension}`,
        );
        form.append('model', 'whisper-1');
        form.append('language', 'pt');

        let response: Response;

        try {
            response = await fetch(WHISPER_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
                body: form as any,
            });
        } catch (error: any) {
            throw new BadRequestException(
                `Erro de conexão ao transcrever o áudio: ${error?.message || 'falha de rede'}.`,
            );
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');

            throw new BadRequestException(
                `Erro ao transcrever o áudio (${response.status}). ${errorBody.slice(0, 300)}`,
            );
        }

        const data = (await response.json()) as { text?: string };

        if (!data.text || !data.text.trim()) {
            throw new BadRequestException(
                'Não foi possível entender nada no áudio. Tente gravar de novo falando mais perto do microfone.',
            );
        }

        return data.text.trim();
    }

    async extractDraft(transcript: string): Promise<VoicePurchaseDraft> {
        const apiKey = this.getApiKey();

        let response: Response;

        try {
            response = await fetch(CHAT_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    response_format: { type: 'json_object' },
                    temperature: 0,
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: transcript },
                    ],
                }),
            });
        } catch (error: any) {
            throw new BadRequestException(
                `Erro de conexão ao interpretar o áudio: ${error?.message || 'falha de rede'}.`,
            );
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '');

            throw new BadRequestException(
                `Erro ao interpretar o áudio (${response.status}). ${errorBody.slice(0, 300)}`,
            );
        }

        const data = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };

        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new BadRequestException(
                'A IA não devolveu nenhum dado a partir do áudio.',
            );
        }

        let parsed: any;

        try {
            parsed = JSON.parse(content);
        } catch {
            throw new BadRequestException(
                'Não foi possível interpretar a resposta da IA. Tente gravar o áudio de novo.',
            );
        }

        return this.normalizeDraft(parsed);
    }

    private normalizeDraft(raw: any): VoicePurchaseDraft {
        const paymentMethod = PAYMENT_METHODS.includes(raw?.paymentMethod)
            ? (raw.paymentMethod as PaymentMethod)
            : null;

        const items: VoicePurchaseItemDraft[] = Array.isArray(raw?.items)
            ? raw.items
                .filter((item: any) => item && item.name)
                .map((item: any) => ({
                    name: String(item.name).trim(),
                    quantity:
                        Number.isFinite(Number(item.quantity)) &&
                            Number(item.quantity) > 0
                            ? Number(item.quantity)
                            : 1,
                    unit:
                        typeof item.unit === 'string' && item.unit.trim()
                            ? item.unit.trim()
                            : null,
                    unitPrice:
                        Number.isFinite(Number(item.unitPrice)) &&
                            Number(item.unitPrice) > 0
                            ? Number(item.unitPrice)
                            : null,
                    total:
                        Number.isFinite(Number(item.total)) &&
                            Number(item.total) > 0
                            ? Number(item.total)
                            : null,
                }))
            : [];

        return {
            description:
                typeof raw?.description === 'string' &&
                    raw.description.trim()
                    ? raw.description.trim()
                    : 'Compra cadastrada por voz',
            supplierName:
                typeof raw?.supplierName === 'string' &&
                    raw.supplierName.trim()
                    ? raw.supplierName.trim()
                    : null,
            paymentMethod,
            items,
            notes:
                typeof raw?.notes === 'string' && raw.notes.trim()
                    ? raw.notes.trim()
                    : null,
            informedTotalValue:
                Number.isFinite(Number(raw?.informedTotalValue)) &&
                    Number(raw.informedTotalValue) > 0
                    ? Number(raw.informedTotalValue)
                    : null,
        };
    }

    async buildDraftFromAudio(buffer: Buffer, mimetype: string) {
        const transcript = await this.transcribe(buffer, mimetype);
        const draft = await this.extractDraft(transcript);

        return { transcript, draft };
    }
}
