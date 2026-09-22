import { Module } from '@nestjs/common';

import { FinancialDashboardController } from './financial-dashboard.controller';
import { FinancialDashboardService } from './financial-dashboard.service';

@Module({
    controllers: [FinancialDashboardController],
    providers: [FinancialDashboardService],
})
export class FinancialDashboardModule { }
