import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
    constructor(private dashboardService: DashboardService) { }

    @Get('summary')
    async summary() {
        return this.dashboardService.summary();
    }

    @Get('badges')
    async badges() {
        return this.dashboardService.badges();
    }
}