import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { BillsModule } from '../bills/bills.module';
import { BillCategoriesModule } from '../bill-categories/bill-categories.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
    imports: [
        NotificationsModule,
        SuppliersModule,
        BillsModule,
        BillCategoriesModule,
    ],
    controllers: [ServicesController],
    providers: [ServicesService, PrismaService],
    exports: [ServicesService],
})
export class ServicesModule { }
