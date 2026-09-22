import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { FiscalDashboardService } from './fiscal-dashboard.service';

@Controller('fiscal-dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.NOTAS_FISCAIS)
export class FiscalDashboardController {
    constructor(private fiscalDashboardService: FiscalDashboardService) { }

    @Get('summary')
    async summary(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('month') month?: string,
        @Query('year') year?: string,
    ) {
        const now = new Date();

        return this.fiscalDashboardService.summary(user, {
            storeId,
            month: month ? Number(month) : now.getMonth() + 1,
            year: year ? Number(year) : now.getFullYear(),
        });
    }
}
