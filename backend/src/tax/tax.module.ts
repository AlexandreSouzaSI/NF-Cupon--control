import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';
import { TaxConfigController } from './tax-config.controller';
import { TaxConfigService } from './tax-config.service';
import { TaxCalculationController } from './tax-calculation.controller';
import { TaxCalculationService } from './tax-calculation.service';

@Module({
    controllers: [
        RevenueController,
        TaxConfigController,
        TaxCalculationController,
    ],
    providers: [
        RevenueService,
        TaxConfigService,
        TaxCalculationService,
        PrismaService,
    ],
    exports: [RevenueService, TaxConfigService],
})
export class TaxModule { }
