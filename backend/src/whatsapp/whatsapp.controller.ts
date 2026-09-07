import {
    BadRequestException,
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

    // Formato de entrada genérico { phone, text } — funciona direto pra
    // teste manual e é o formato mais simples possível. Quando um provedor
    // real for escolhido (Z-API, Evolution API ou Meta Cloud API), o
    // payload que ele manda é diferente disso e precisa de um adaptador
    // aqui na frente traduzindo pro mesmo { phone, text } antes de chamar
    // handleInboundMessage — nenhum provedor foi escolhido ainda, então
    // esse adaptador não existe por enquanto.
    @Post('webhook')
    async webhook(
        @Body() body: { phone?: string; text?: string },
        @Query('token') token?: string,
    ) {
        const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;

        if (!expectedToken) {
            throw new ServiceUnavailableException(
                'Webhook do WhatsApp ainda não configurado (defina WHATSAPP_WEBHOOK_TOKEN).',
            );
        }

        if (token !== expectedToken) {
            throw new UnauthorizedException('Token inválido.');
        }

        if (!body?.phone || !body?.text) {
            throw new BadRequestException('Informe phone e text.');
        }

        return this.whatsappService.handleInboundMessage(body.phone, body.text);
    }
}
