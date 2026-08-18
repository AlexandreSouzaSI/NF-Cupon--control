import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
    imports: [NotificationsModule],
    controllers: [TasksController],
    providers: [TasksService, PrismaService],
})
export class TasksModule { }
