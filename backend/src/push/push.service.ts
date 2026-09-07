import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Injectable()
export class PushService {
    constructor(private prisma: PrismaService) { }

    // "upsert" pelo endpoint: o mesmo navegador/dispositivo pode chamar
    // subscribe de novo (ex: depois de limpar permissão e reativar) sem
    // gerar registro duplicado. Se o endpoint já existia vinculado a outro
    // usuário (ex: mesmo navegador, login trocado no mesmo aparelho),
    // reatribui pro usuário atual.
    async subscribe(dto: SubscribePushDto, user: any) {
        await this.prisma.pushSubscription.upsert({
            where: { endpoint: dto.endpoint },
            update: {
                userId: user.id,
                p256dh: dto.keys.p256dh,
                auth: dto.keys.auth,
            },
            create: {
                userId: user.id,
                endpoint: dto.endpoint,
                p256dh: dto.keys.p256dh,
                auth: dto.keys.auth,
            },
        });

        return { success: true };
    }

    async unsubscribe(endpoint: string, user: any) {
        await this.prisma.pushSubscription.deleteMany({
            where: { endpoint, userId: user.id },
        });

        return { success: true };
    }
}
