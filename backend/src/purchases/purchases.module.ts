import { Module } from '@nestjs/common';

import { PurchasesController } from './purchases.controller';

import { PurchasesService } from './purchases.service';
import { PurchaseVoiceService } from './purchase-voice.service';

import { NotificationsModule } from '../notifications/notifications.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { BillsModule } from '../bills/bills.module';
import { BillCategoriesModule } from '../bill-categories/bill-categories.module';

@Module({
  imports: [
    NotificationsModule,
    SuppliersModule,
    BillsModule,
    BillCategoriesModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchaseVoiceService],
})
export class PurchasesModule { }