import { Module } from '@nestjs/common';

import { PurchasesController } from './purchases.controller';

import { PurchasesService } from './purchases.service';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule { }