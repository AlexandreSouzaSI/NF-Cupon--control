import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

// Perfis com acesso global (Administrativo/Proprietário) sempre recebem
// notificação de qualquer loja — mesmo critério usado em todo o resto do
// sistema pra "acesso a tudo".
const GLOBAL_ACCESS_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
];

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private readonly webPushConfigured: boolean;

    constructor(private prisma: PrismaService) {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const subject = process.env.VAPID_SUBJECT;

        this.webPushConfigured = Boolean(publicKey && privateKey && subject);

        if (this.webPushConfigured) {
            webpush.setVapidDetails(subject!, publicKey!, privateKey!);
        } else {
            this.logger.warn(
                'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT não configuradas — ' +
                'notificação push do navegador desativada (o sino dentro do app continua funcionando normal).',
            );
        }
    }

    // Manda o push de verdade (fora do navegador/app aberto) pras
    // inscrições ativas dos usuários informados. Chamado depois que as
    // notificações já foram gravadas no banco — se o push falhar, a
    // notificação dentro do app já existe de qualquer forma.
    private async sendWebPush(
        userIds: string[],
        payload: { title: string; message: string; type: NotificationType },
    ) {
        if (!this.webPushConfigured || userIds.length === 0) return;

        const subscriptions = await this.prisma.pushSubscription.findMany({
            where: { userId: { in: userIds } },
        });

        const body = JSON.stringify({
            title: payload.title,
            message: payload.message,
            type: payload.type,
            url: '/notifications',
        });

        await Promise.all(
            subscriptions.map(async (subscription) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: subscription.endpoint,
                            keys: {
                                p256dh: subscription.p256dh,
                                auth: subscription.auth,
                            },
                        },
                        body,
                    );
                } catch (error: any) {
                    // 404/410 = inscrição expirada ou revogada (usuário
                    // desinstalou o PWA, limpou dados do site, etc.) — some
                    // silenciosamente do banco em vez de ficar tentando de
                    // novo em toda notificação futura.
                    if (error?.statusCode === 404 || error?.statusCode === 410) {
                        await this.prisma.pushSubscription
                            .delete({ where: { endpoint: subscription.endpoint } })
                            .catch(() => undefined);
                    } else {
                        this.logger.warn(
                            `Falha ao enviar push (endpoint ${subscription.endpoint}): ${error?.message || error}`,
                        );
                    }
                }
            }),
        );
    }

    async create(data: {
        title: string;
        message: string;
        type: NotificationType;
        userId?: string | null;
    }) {
        return this.prisma.notification.create({
            data,
        });
    }

    // Notifica só quem de fato tem acesso ao evento: perfis globais
    // (Administrativo/Proprietário) sempre, e os demais perfis listados em
    // `allowedRoles` só se estiverem vinculados à `storeId` da ação (ex:
    // uma compra criada na loja Contagem só notifica quem tem acesso a
    // Compras na loja Contagem). Cria uma notificação por usuário
    // (`userId` sempre preenchido), em vez da notificação global antiga —
    // assim cada um só vê o que é dele em /notifications.
    async notifyStoreAccess(options: {
        storeId: string;
        allowedRoles: UserRole[];
        title: string;
        message: string;
        type: NotificationType;
        excludeUserId?: string;
    }) {
        const users = await this.prisma.user.findMany({
            where: {
                active: true,
                id: options.excludeUserId ? { not: options.excludeUserId } : undefined,
                OR: [
                    { role: { in: GLOBAL_ACCESS_ROLES } },
                    {
                        role: { in: options.allowedRoles },
                        userStores: { some: { storeId: options.storeId } },
                    },
                ],
            },
            select: { id: true },
        });

        if (users.length === 0) return [];

        await this.prisma.notification.createMany({
            data: users.map((u) => ({
                title: options.title,
                message: options.message,
                type: options.type,
                userId: u.id,
            })),
        });

        await this.sendWebPush(
            users.map((u) => u.id),
            {
                title: options.title,
                message: options.message,
                type: options.type,
            },
        );

        return users;
    }

    async findAll(user: any) {
        return this.prisma.notification.findMany({
            where: {
                OR: [{ userId: user.id }, { userId: null }],
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async findUnread(user: any) {
        return this.prisma.notification.findMany({
            where: {
                read: false,
                OR: [{ userId: user.id }, { userId: null }],
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    async markAsRead(id: string, user: any) {
        const notification = await this.prisma.notification.findUnique({
            where: { id },
        });

        if (!notification) return null;

        // Só marca como lida a que é sua (userId igual) ou uma antiga
        // global (userId nulo) — não deixa marcar a notificação de outro
        // usuário como lida.
        if (notification.userId && notification.userId !== user.id) {
            return notification;
        }

        return this.prisma.notification.update({
            where: { id },
            data: {
                read: true,
            },
        });
    }
}