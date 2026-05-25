import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
    constructor(private alertsService: AlertsService) { }

    @Get()
    async findAll() {
        return this.alertsService.findAll();
    }

    @Post(':id/resolve')
    async resolve(@Param('id') id: string) {
        return this.alertsService.resolve(id);
    }
}