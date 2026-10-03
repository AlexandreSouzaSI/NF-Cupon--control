import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';

@Injectable()
export class AlertsService {
    constructor(private prisma: PrismaService) { }

    // Delega pro helper compartilhado (src/common/store-scope.util.ts) — corrige vazamento cross-empresa: antes, ADMINISTRATIVO/PROPRIETARIO de qualquer empresa via/mexia em dado de qualquer outra (undefined = sem filtro nenhum, escrito quando só existia uma empresa no banco).
    private async getAllowedStoreIds(user: any): Promise<string[] | undefined> {
        return resolveAllowedStoreIds(this.prisma, user);
    }

    async findAll(user: any) {
        const allowedStoreIds = await this.getAllowedStoreIds(user);

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
            // Teto de segurança — alerta não resolvido tende a ficar pouco
            // tempo aberto, mas sem limite aqui uma base grande (ou um bug
            // que pare de resolver alertas) faria essa lista crescer sem
            // fim. 200 é bem acima de qualquer uso real hoje.
            take: 200,
            include: {
                purchase: {
                    include: {
                        // select em vez de include completo: a tela só
                        // precisa de nome/identificador de cada relação,
                        // não do registro inteiro (endereço de loja,
                        // categorias de fornecedor etc).
                        store: { select: { id: true, name: true } },
                        supplier: { select: { id: true, name: true } },
                        createdBy: { select: { id: true, name: true } },
                    },
                },
            },
        });
    }

    async resolve(id: string, user: any) {
        const allowedStoreIds = await this.getAllowedStoreIds(user);

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