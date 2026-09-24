import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsPublicController } from './quotations-public.controller';
import { QuotationsService } from './quotations.service';

@Module({
    imports: [NotificationsModule],
    controllers: [QuotationsController, QuotationsPublicController],
    providers: [QuotationsService],
})
export class QuotationsModule { }
