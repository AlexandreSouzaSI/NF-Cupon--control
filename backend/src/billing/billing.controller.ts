import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { AdminMasterGuard } from '../auth/admin-master.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BillingService } from './billing.service';
import { CheckoutDto, GrantSubscriptionDto } from './dto/checkout.dto';

// Cobrança do ponto de vista do cliente. Nenhuma rota aqui exige módulo
// ligado na loja — é de propósito: quem está bloqueado por falta de
// pagamento (ou com o teste vencido; ver jwt.strategy.ts) precisa
// continuar alcançando /billing pra regularizar.
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BillingController {
    constructor(private billingService: BillingService) { }

    // Qualquer usuário logado pode ver o estado da assinatura da própria
    // empresa (a tela decide o que mostrar). `sync=1` pede ao Asaas o
    // estado atual das cobranças (usado só na tela de planos).
    @Get('me')
    me(@CurrentUser() user: any, @Query('sync') sync?: string) {
        return this.billingService.getMe(user, { sync: sync === '1' });
    }

    // Só Proprietário/Administrativo assinam (RolesGuard já deixa passar a
    // conta de teste, que vira Proprietário no pagamento, e o Admin Master,
    // que o service recusa por ser isento).
    @Post('checkout')
    @Roles(UserRole.PROPRIETARIO, UserRole.ADMINISTRATIVO)
    checkout(@CurrentUser() user: any, @Body() body: CheckoutDto) {
        return this.billingService.checkout(user, body);
    }

    @Post('cancel')
    @Roles(UserRole.PROPRIETARIO, UserRole.ADMINISTRATIVO)
    cancel(@CurrentUser() user: any) {
        return this.billingService.cancel(user);
    }
}

// Visão de assinaturas por empresa + liberar/bloquear manual — Admin Master.
@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, AdminMasterGuard)
export class AdminSubscriptionsController {
    constructor(private billingService: BillingService) { }

    @Get()
    list() {
        return this.billingService.listSubscriptionsForAdmin();
    }

    @Post(':empresaId/grant')
    grant(
        @Param('empresaId') empresaId: string,
        @Body() body: GrantSubscriptionDto,
    ) {
        return this.billingService.grantManually(empresaId, body);
    }

    @Post(':empresaId/block')
    block(@Param('empresaId') empresaId: string) {
        return this.billingService.blockManually(empresaId);
    }
}
