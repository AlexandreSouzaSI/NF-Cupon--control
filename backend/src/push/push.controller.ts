import { Body, Controller, Delete, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

// Sem @Roles aqui de propósito — qualquer perfil autenticado pode ativar
// push pra si mesmo. Quem recebe notificação de fato continua controlado
// pelo NotificationsService (notifyStoreAccess), igual já era pro sino
// dentro do app.
@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
    constructor(private pushService: PushService) { }

    @Post('subscribe')
    async subscribe(@Body() body: SubscribePushDto, @CurrentUser() user: any) {
        return this.pushService.subscribe(body, user);
    }

    @Delete('subscribe')
    async unsubscribe(
        @Query('endpoint') endpoint: string,
        @CurrentUser() user: any,
    ) {
        return this.pushService.unsubscribe(endpoint, user);
    }
}
