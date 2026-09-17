import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    @Get('summary')
    async summary(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        // "AAAA-MM" pra escolher outro mês além do corrente no seletor do
        // Dashboard — só afeta os totais mensais (Serviços, NF, Faturamento,
        // Perdas, Folha, Freelancers); "hoje"/"essa semana" continuam reais.
        @Query('month') month?: string,
    ) {
        return this.dashboardService.summary(user, storeId, month);
    }

    @Get('badges')
    async badges(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.dashboardService.badges(user, storeId);
    }
}