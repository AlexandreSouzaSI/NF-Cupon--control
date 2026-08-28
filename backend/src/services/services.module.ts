import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({
    imports: [NotificationsModule],
    controllers: [ServicesController],
    providers: [ServicesService, PrismaService],
    exports: [ServicesService],
})
export class ServicesModule { }
