import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private notificationsService: NotificationsService) { }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.notificationsService.findAll(user);
    }

    @Get('unread')
    async findUnread(@CurrentUser() user: any) {
        return this.notificationsService.findUnread(user);
    }

    @Post(':id/read')
    async markAsRead(@Param('id') id: string, @CurrentUser() user: any) {
        return this.notificationsService.markAsRead(id, user);
    }
}