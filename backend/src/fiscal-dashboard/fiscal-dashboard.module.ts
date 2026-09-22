import { Module } from '@nestjs/common';

import { FiscalDashboardController } from './fiscal-dashboard.controller';
import { FiscalDashboardService } from './fiscal-dashboard.service';

@Module({
    controllers: [FiscalDashboardController],
    providers: [FiscalDashboardService],
})
export class FiscalDashboardModule { }
