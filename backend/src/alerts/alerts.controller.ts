import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
    constructor(private alertsService: AlertsService) { }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.alertsService.findAll(user);
    }

    @Post(':id/resolve')
    async resolve(@Param('id') id: string, @CurrentUser() user: any) {
        return this.alertsService.resolve(id, user);
    }
}