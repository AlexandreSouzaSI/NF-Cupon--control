import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlertsService {
    constructor(private prisma: PrismaService) { }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    async findAll(user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        return this.prisma.purchaseAlert.findMany({
            where: {
                resolved: false,
                ...(allowedStoreIds
                    ? {
                        OR: [
                            { purchaseId: null },
                            {
                                purchase: {
                                    storeId: { in: allowedStoreIds },
                                },
                            },
                        ],
                    }
                    : {}),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                purchase: {
                    include: {
                        store: true,
                        supplier: true,
                        createdBy: true,
                    },
                },
            },
        });
    }

    async resolve(id: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (allowedStoreIds) {
            const alert = await this.prisma.purchaseAlert.findUnique({
                where: { id },
                include: {
                    purchase: {
                        select: { storeId: true },
                    },
                },
            });

            if (!alert) {
                throw new NotFoundException('Alerta não encontrado.');
            }

            if (
                alert.purchase &&
                !allowedStoreIds.includes(alert.purchase.storeId)
            ) {
                throw new ForbiddenException(
                    'Você não tem acesso a esta loja.',
                );
            }
        }

        return this.prisma.purchaseAlert.update({
            where: { id },
            data: {
                resolved: true,
            },
        });
    }
}