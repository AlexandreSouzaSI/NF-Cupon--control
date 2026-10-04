import {
    Body,
    Controller,
    Headers,
    HttpCode,
    Post,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

import { BillingService } from './billing.service';

// Endpoint PÚBLICO (o Asaas não loga no sistema) — protegido pelo token
// secreto que você cadastra no painel do Asaas (Integrações → Webhooks →
// "Token de autenticação") e repete em ASAAS_WEBHOOK_TOKEN. O Asaas manda
// esse valor no header `asaas-access-token`. Sem a variável definida o
// endpoint fica desligado (503), igual ao webhook do WhatsApp — nunca
// aberto sem querer. O token nunca é logado.
@Controller('billing')
export class BillingWebhookController {
    constructor(private billingService: BillingService) { }

    @Post('webhook')
    @HttpCode(200)
    async webhook(
        @Body() body: any,
        @Headers('asaas-access-token') token?: string,
    ) {
        const expected = process.env.ASAAS_WEBHOOK_TOKEN;

        if (!expected) {
            throw new ServiceUnavailableException(
                'Webhook do Asaas ainda não configurado (defina ASAAS_WEBHOOK_TOKEN).',
            );
        }

        if (!this.tokensMatch(token, expected)) {
            throw new UnauthorizedException('Token inválido.');
        }

        // Qualquer exceção aqui vira 500 de propósito: o Asaas reenvia o
        // evento (e o processamento é idempotente por asaasPaymentId).
        return this.billingService.handleWebhook(body);
    }

    // Comparação em tempo constante pra não vazar o token por tempo de
    // resposta.
    private tokensMatch(received: string | undefined, expected: string) {
        if (!received) return false;

        const a = Buffer.from(received);
        const b = Buffer.from(expected);

        return a.length === b.length && timingSafeEqual(a, b);
    }
}
