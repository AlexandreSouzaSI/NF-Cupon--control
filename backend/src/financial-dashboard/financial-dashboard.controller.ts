import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { FinancialDashboardService } from './financial-dashboard.service';

// Mistura dado de Contas a Pagar e Conciliação de Caixa, então libera se a
// loja tiver QUALQUER um dos dois módulos (mesmo critério do "Dashboard
// Financeiro" no menu do frontend — ver groupModules em lib/menu.ts).
@Controller('financial-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule([StoreModule.CONTAS_A_PAGAR, StoreModule.CONCILIACAO_CAIXA])
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

    // Visão da loja Pessoa Física (Atrasadas/Hoje/7 dias/Mês + próximas
    // contas). Mesmos guards do controller: perfil + módulo + escopo de loja
    // (checado no service).
    @Get('overview-fisica')
    async overviewFisica(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.financialDashboardService.overviewFisica(user, storeId);
    }
}
