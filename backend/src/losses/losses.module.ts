import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LossesController } from './losses.controller';
import { LossesService } from './losses.service';

@Module({
    imports: [NotificationsModule],
    controllers: [LossesController],
    providers: [LossesService],
})
export class LossesModule { }
