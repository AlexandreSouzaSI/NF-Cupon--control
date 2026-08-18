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
    ) {
        return this.dashboardService.summary(user, storeId);
    }

    @Get('badges')
    async badges(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.dashboardService.badges(user, storeId);
    }
}