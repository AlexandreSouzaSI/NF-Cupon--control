import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CashReconciliationController } from './cash-reconciliation.controller';
import { CashReconciliationService } from './cash-reconciliation.service';

@Module({
    controllers: [CashReconciliationController],
    providers: [CashReconciliationService, PrismaService],
    exports: [CashReconciliationService],
})
export class CashReconciliationModule { }
