import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { FinancialDashboardService } from './financial-dashboard.service';

// Mesmo espírito de acesso de Contas a Pagar — é dado financeiro, então
// reusa o mesmo módulo (CONTAS_A_PAGAR) e o mesmo trio de perfis, em vez
// de criar um StoreModule novo só pra essa tela de visão geral.
@Controller('financial-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.CONTAS_A_PAGAR)
export class FinancialDashboardController {
    constructor(
        private financialDashboardService: FinancialDashboardService,
    ) { }

    @Get('summary')
    async summary(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('month') month: string,
        @Query('year') year: string,
    ) {
        const now = new Date();

        return this.financialDashboardService.summary(user, {
            storeId,
            month: month ? Number(month) : now.getMonth() + 1,
            year: year ? Number(year) : now.getFullYear(),
        });
    }
}
