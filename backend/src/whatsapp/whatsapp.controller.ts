import {
    Body,
    Controller,
    Post,
    Query,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common';

import { WhatsappService } from './whatsapp.service';

// Endpoint público (o provedor de WhatsApp que manda a requisição não tem
// como logar no sistema) — por isso a proteção não é JwtAuthGuard, é um
// token secreto compartilhado (WHATSAPP_WEBHOOK_TOKEN) que só o backend e
// o painel do provedor conhecem. Sem essa variável configurada, o endpoint
// fica desligado de propósito (em vez de aceitar qualquer coisa sem
// proteção nenhuma).
@Controller('whatsapp')
export class WhatsappController {
    constructor(private whatsappService: WhatsappService) { }

    // Aceita dois formatos de payload — parseInboundPayload() traduz os
    // dois pro mesmo { phone, text } antes de chamar handleInboundMessage:
    //   1) { phone, text } genérico — útil pra testar na mão (curl/Postman).
    //   2) o formato real da Evolution API (evento "messages.upsert", ver
    //      /webhook/set/{instance} e docs em
    //      docs.evolutionfoundation.com.br/en/evolution-api/configuration/webhooks).
    @Post('webhook')
    async webhook(@Body() body: any, @Query('token') token?: string) {
        const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;

        if (!expectedToken) {
            throw new ServiceUnavailableException(
                'Webhook do WhatsApp ainda não configurado (defina WHATSAPP_WEBHOOK_TOKEN).',
            );
        }

        if (token !== expectedToken) {
            throw new UnauthorizedException('Token inválido.');
        }

        const parsed = this.parseInboundPayload(body);

        if (!parsed) {
            // Não é uma mensagem de texto recebida de alguém (pode ser eco
            // da própria mensagem que o sistema mandou, status de entrega,
            // atualização de conexão etc.) — ignora sem dar erro, já que a
            // Evolution manda vários tipos de evento pro mesmo webhook.
            return { matched: false, ignored: true };
        }

        return this.whatsappService.handleInboundMessage(
            parsed.phone,
            parsed.text,
        );
    }

    private parseInboundPayload(
        body: any,
    ): { phone: string; text: string } | null {
        // Formato simples de teste manual.
        if (body?.phone && body?.text) {
            return { phone: body.phone, text: body.text };
        }

        // Formato da Evolution API: só processa mensagem recebida de
        // verdade (fromMe: false), ignorando o resto (eco de envio,
        // atualização de status/conexão etc.).
        const data = body?.data;

        if (body?.event === 'messages.upsert' && data && data.key?.fromMe !== true) {
            const remoteJid: string | undefined = data.key?.remoteJid;
            const text: string | undefined =
                data.message?.conversation ||
                data.message?.extendedTextMessage?.text;

            if (remoteJid && text) {
                const phone = remoteJid.split('@')[0];

                return { phone, text };
            }
        }

        return null;
    }
}
