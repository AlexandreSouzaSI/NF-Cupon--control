import { Injectable } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
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
    constructor(private prisma: PrismaService) { }

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