import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { QuotationsService } from './quotations.service';
import { SubmitQuotationPricesDto } from './dto/submit-quotation-prices.dto';

// Rotas públicas, sem login — o fornecedor abre o link do WhatsApp e cai
// direto aqui. O token da URL é a única "autenticação" (mesmo padrão do
// QuotationSupplier.token/confirmToken já desenhado no schema desde a
// Fase 1). De propósito num controller separado do QuotationsController
// (que tem JwtAuthGuard/RolesGuard/ModuleAccessGuard na classe inteira),
// pra nunca essas rotas herdarem guard nenhum por engano.
@Controller('quotations/public')
export class QuotationsPublicController {
    constructor(private quotationsService: QuotationsService) { }

    // Rotas de confirmação de pedido (Fase 6) — precisam vir ANTES de
    // ':token'/':token/...' abaixo, senão o Nest casaria "confirm" como
    // se fosse o token de preenchimento de preço.

    @Get('confirm/:confirmToken')
    async getOrderConfirmation(@Param('confirmToken') confirmToken: string) {
        return this.quotationsService.getPublicOrderConfirmation(confirmToken);
    }

    @Post('confirm/:confirmToken')
    async confirmOrder(@Param('confirmToken') confirmToken: string) {
        return this.quotationsService.confirmPublicOrder(confirmToken);
    }

    @Get(':token')
    async getQuotation(@Param('token') token: string) {
        return this.quotationsService.getPublicQuotation(token);
    }

    @Post(':token/submit')
    async submitPrices(
        @Param('token') token: string,
        @Body() body: SubmitQuotationPricesDto,
    ) {
        return this.quotationsService.submitPublicPrices(token, body);
    }

    @Post(':token/decline')
    async decline(@Param('token') token: string) {
        return this.quotationsService.declinePublicQuotation(token);
    }
}
