import { Injectable, Logger } from '@nestjs/common';

// Cobrança (pagamento) devolvida pela API v3 do Asaas — só os campos que o
// sistema usa. `value` vem em REAIS (decimal), não em centavos.
export type AsaasPayment = {
    id: string;
    customer?: string;
    // Id da assinatura (sub_xxx) quando a cobrança nasceu de uma
    // assinatura recorrente; ausente em cobrança avulsa.
    subscription?: string | null;
    value: number;
    // PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED, RECEIVED_IN_CASH...
    status: string;
    // BOLETO, CREDIT_CARD, PIX ou UNDEFINED (cliente ainda não escolheu).
    billingType?: string;
    // "YYYY-MM-DD"
    dueDate?: string;
    paymentDate?: string | null;
    confirmedDate?: string | null;
    // Link da fatura hospedada pelo Asaas: o cliente escolhe Pix/boleto/
    // cartão e paga lá, sem o sistema tocar em dado de cartão.
    invoiceUrl?: string | null;
    externalReference?: string | null;
};

export type AsaasSubscription = {
    id: string;
    customer: string;
    status?: string;
    value?: number;
    nextDueDate?: string;
};

// Erro de negócio devolvido pelo Asaas (4xx) ou falha de rede/5xx. `status`
// = 0 quando nem chegou resposta (timeout/DNS).
export class AsaasApiError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'AsaasApiError';
    }
}

// Cliente HTTP enxuto da API v3 do Asaas (https://docs.asaas.com), sem SDK
// — mesmo padrão do provider da Evolution/Resend (fetch nativo). Variáveis
// de ambiente (ver .env.example):
//   ASAAS_API_KEY        chave de API (sandbox ou produção)
//   ASAAS_BASE_URL       padrão = sandbox; produção é https://api.asaas.com/v3
//   ASAAS_WEBHOOK_TOKEN  validado em billing-webhook.controller.ts
// Sem ASAAS_API_KEY, isConfigured() devolve false e o checkout responde 503
// em vez de quebrar o sistema. A chave só viaja no header `access_token` e
// NUNCA é escrita em log.
@Injectable()
export class AsaasClient {
    private readonly logger = new Logger('AsaasClient');

    private get baseUrl() {
        return (
            process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3'
        ).replace(/\/+$/, '');
    }

    isConfigured() {
        return Boolean(process.env.ASAAS_API_KEY);
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<T> {
        let response: Response;

        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    access_token: process.env.ASAAS_API_KEY || '',
                    // O Asaas exige User-Agent identificando a aplicação.
                    'User-Agent': 'GalhoHub',
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(15000),
            });
        } catch {
            // Mensagem genérica de propósito: nada de URL/headers no erro.
            throw new AsaasApiError(0, 'Não foi possível falar com o Asaas.');
        }

        const text = await response.text();
        let json: any = null;

        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        if (!response.ok) {
            // Formato de erro do Asaas: { errors: [{ code, description }] }
            const description: string | undefined =
                json?.errors?.[0]?.description;

            this.logger.warn(
                `Asaas ${method} ${path} falhou (${response.status}): ${description || 'sem detalhe'}`,
            );

            throw new AsaasApiError(
                response.status,
                description || `Asaas respondeu ${response.status}.`,
            );
        }

        return json as T;
    }

    createCustomer(input: {
        name: string;
        cpfCnpj: string;
        email?: string;
        externalReference?: string;
    }) {
        return this.request<{ id: string }>('POST', '/customers', input);
    }

    // billingType UNDEFINED deixa o cliente escolher Pix, boleto ou cartão
    // na tela de pagamento do Asaas.
    createSubscription(input: {
        customer: string;
        value: number;
        nextDueDate: string;
        description: string;
        externalReference: string;
    }) {
        return this.request<AsaasSubscription>('POST', '/subscriptions', {
            ...input,
            billingType: 'UNDEFINED',
            cycle: 'MONTHLY',
        });
    }

    deleteSubscription(id: string) {
        return this.request<{ deleted: boolean; id: string }>(
            'DELETE',
            `/subscriptions/${encodeURIComponent(id)}`,
        );
    }

    listSubscriptionPayments(id: string) {
        return this.request<{ data: AsaasPayment[] }>(
            'GET',
            `/subscriptions/${encodeURIComponent(id)}/payments`,
        );
    }
}
