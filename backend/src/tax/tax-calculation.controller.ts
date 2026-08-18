import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { TaxCalculationService } from './tax-calculation.service';

@Controller('tax-calculations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.FINANCEIRO,
)
export class TaxCalculationController {
    constructor(private taxCalculationService: TaxCalculationService) { }

    @Get()
    async calculate(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('referenceMonth') referenceMonth: string,
    ) {
        return this.taxCalculationService.calculate(
            storeId,
            referenceMonth,
            user,
        );
    }

    // Compara os 3 regimes lado a lado pro mesmo mês — usado no gráfico
    // "onde dá pra reduzir" do dashboard.
    @Get('compare')
    async compare(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('referenceMonth') referenceMonth: string,
    ) {
        return this.taxCalculationService.compareRegimes(
            storeId,
            referenceMonth,
            user,
        );
    }
}
