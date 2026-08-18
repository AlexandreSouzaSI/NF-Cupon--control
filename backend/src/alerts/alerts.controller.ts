import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlertsService } from './alerts.service';

// Mesmo grupo de perfis que já via a aba Alertas no menu (menu.ts) — só
// formalizando no backend o que já era assim na prática.
@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.FINANCEIRO,
)
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