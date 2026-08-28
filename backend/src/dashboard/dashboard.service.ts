import { ForbiddenException, Injectable } from '@nestjs/common';
import {
    BillStatus,
    PurchaseAlertLevel,
    PurchaseStatus,
    TaskOccurrenceStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Mesmo critério de "quem vê tudo" usado em tasks.service.ts — Proprietário
// e Administrativo enxergam o quadro da equipe inteira; os demais perfis só
// veem o próprio card de pendências pessoais.
const GLOBAL_TASK_VIEW_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
];

type TeamTaskStat = {
    userId: string;
    userName: string;
    aFazer: number;
    emAndamento: number;
    pausada: number;
    atraso: number;
    concluidas: number;
};

@Injectable()
export class DashboardService {
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

    // O dashboard é sempre sobre a loja ativa escolhida no topo do sistema,
    // nunca a soma de todas as lojas que o usuário tem acesso.
    private resolveStoreFilter(user: any, storeId?: string) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (storeId) {
            if (allowedStoreIds && !allowedStoreIds.includes(storeId)) {
                throw new ForbiddenException(
                    'Você não tem acesso a esta loja.',
                );
            }

            return storeId;
        }

        // Sem loja ativa informada: mantém o comportamento antigo como
        // fallback (todas as lojas permitidas), só pra não quebrar chamadas
        // feitas sem o parâmetro.
        return allowedStoreIds ? { in: allowedStoreIds } : undefined;
    }

    private getStartOfDay(date = new Date()) {
        const result = new Date(date);

        result.setHours(0, 0, 0, 0);

        return result;
    }

    private getEndOfDay(date = new Date()) {
        const result = new Date(date);

        result.setHours(23, 59, 59, 999);

        return result;
    }

    private getEndOfWeek(date = new Date()) {
        const result = new Date(date);

        result.setDate(result.getDate() + 7);
        result.setHours(23, 59, 59, 999);

        return result;
    }

    private getStartOfMonth(date = new Date()) {
        return new Date(
            date.getFullYear(),
            date.getMonth(),
            1,
            0,
            0,
            0,
            0,
        );
    }

    private getEndOfMonth(date = new Date()) {
        return new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
        );
    }

    async summary(user: any, storeId?: string) {
        const storeFilter = this.resolveStoreFilter(user, storeId);
        const isGlobalTaskViewer = GLOBAL_TASK_VIEW_ROLES.includes(
            user.role,
        );

        const purchaseWhere = {
            storeId: storeFilter,
        };

        const billWhere = {
            storeId: storeFilter,
        };

        const todayStart = this.getStartOfDay();
        const todayEnd = this.getEndOfDay();
        const weekEnd = this.getEndOfWeek();
        const monthStart = this.getStartOfMonth();
        const monthEnd = this.getEndOfMonth();

        const [
            totalPurchases,

            waitingApproval,
            waitingReceipt,
            receivedWithDifference,
            waitingInvoice,
            couponOnly,

            purchasesCreatedToday,
            purchasesReceivedToday,
            purchasesClosedToday,

            billsDueToday,
            billsDueWeek,
            overdueBills,

            billsDueTodayValues,
            billsDueWeekValues,
            overdueBillValues,

            totalCardPurchases,

            serviceNfCountMonth,

            lossesCountMonth,
            myPendingTasks,
            teamTaskOccurrences,

            criticalAlerts,
            unreadNotifications,

            recentPurchases,
            recentAlerts,

            pendingApprovalPurchases,
            pendingReceiptPurchases,
            pendingInvoicePurchases,
            divergencePurchases,
        ] = await Promise.all([
            this.prisma.purchase.count({
                where: purchaseWhere,
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.WAITING_APPROVAL,
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.WAITING_RECEIPT,
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    status:
                        PurchaseStatus.RECEIVED_WITH_DIFFERENCE,
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.WAITING_INVOICE,
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.HAS_COUPON_ONLY,
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    createdAt: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    checkedAt: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
            }),

            this.prisma.purchase.count({
                where: {
                    ...purchaseWhere,
                    closedAt: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
            }),

            this.prisma.bill.count({
                where: {
                    ...billWhere,
                    status: BillStatus.OPEN,
                    dueDate: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
            }),

            this.prisma.bill.count({
                where: {
                    ...billWhere,
                    status: BillStatus.OPEN,
                    dueDate: {
                        gte: todayStart,
                        lte: weekEnd,
                    },
                },
            }),

            this.prisma.bill.count({
                where: {
                    ...billWhere,
                    status: {
                        in: [
                            BillStatus.OPEN,
                            BillStatus.OVERDUE,
                        ],
                    },
                    dueDate: {
                        lt: todayStart,
                    },
                },
            }),

            this.prisma.bill.findMany({
                where: {
                    ...billWhere,
                    status: BillStatus.OPEN,
                    dueDate: {
                        gte: todayStart,
                        lte: todayEnd,
                    },
                },
                select: {
                    value: true,
                },
            }),

            this.prisma.bill.findMany({
                where: {
                    ...billWhere,
                    status: BillStatus.OPEN,
                    dueDate: {
                        gte: todayStart,
                        lte: weekEnd,
                    },
                },
                select: {
                    value: true,
                },
            }),

            this.prisma.bill.findMany({
                where: {
                    ...billWhere,
                    status: {
                        in: [
                            BillStatus.OPEN,
                            BillStatus.OVERDUE,
                        ],
                    },
                    dueDate: {
                        lt: todayStart,
                    },
                },
                select: {
                    value: true,
                },
            }),

            this.prisma.purchase.findMany({
                where: {
                    ...purchaseWhere,
                    cardId: {
                        not: null,
                    },
                    status: {
                        notIn: [
                            PurchaseStatus.REJECTED,
                            PurchaseStatus.CANCELED,
                        ],
                    },
                },
                select: {
                    value: true,
                },
            }),

            this.prisma.service.count({
                where: {
                    storeId: storeFilter,
                    nfFileUrl: {
                        not: null,
                    },
                    serviceDate: {
                        gte: monthStart,
                        lte: monthEnd,
                    },
                },
            }),

            this.prisma.productLoss.count({
                where: {
                    storeId: storeFilter,
                    occurredAt: {
                        gte: monthStart,
                        lte: monthEnd,
                    },
                },
            }),

            // Card pessoal: só as ocorrências atribuídas a quem está
            // olhando o dashboard, já vencidas ou vencendo hoje, ainda não
            // concluídas — "tarefas que eu sou obrigado a concluir".
            this.prisma.taskOccurrence.count({
                where: {
                    status: {
                        not: TaskOccurrenceStatus.DONE,
                    },
                    dueDate: {
                        lte: todayEnd,
                    },
                    task: {
                        storeId: storeFilter,
                        active: true,
                        assignedToId: user.id,
                    },
                },
            }),

            // Quadro por pessoa: só carregado pra quem enxerga tudo
            // (Proprietário/Administrativo) — pega o estado atual de cada
            // ocorrência em aberto, mais as concluídas dentro do mês
            // corrente (senão o total só cresceria pra sempre).
            isGlobalTaskViewer
                ? this.prisma.taskOccurrence.findMany({
                    where: {
                        task: {
                            storeId: storeFilter,
                            active: true,
                            // Proprietário nunca é restringido; Administrativo
                            // não deve ver no quadro geral nem os agregados
                            // de uma tarefa que o Proprietário restringiu
                            // especificamente pra ele.
                            ...(user.role === UserRole.ADMINISTRATIVO
                                ? { restrictedFromAdministrativo: false }
                                : {}),
                        },
                        OR: [
                            { status: { not: TaskOccurrenceStatus.DONE } },
                            {
                                status: TaskOccurrenceStatus.DONE,
                                confirmedAt: {
                                    gte: monthStart,
                                    lte: monthEnd,
                                },
                            },
                        ],
                    },
                    select: {
                        status: true,
                        task: {
                            select: {
                                assignedTo: {
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                })
                : Promise.resolve([]),

            this.prisma.purchaseAlert.count({
                where: {
                    resolved: false,
                    level: PurchaseAlertLevel.CRITICAL,
                    purchase: {
                        storeId: storeFilter,
                    },
                },
            }),

            this.prisma.notification.count({
                where: {
                    read: false,
                    OR: [
                        {
                            userId: user.id,
                        },
                        {
                            userId: null,
                        },
                    ],
                },
            }),

            this.prisma.purchase.findMany({
                take: 8,
                where: purchaseWhere,
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                    checkedBy: true,
                    fiscalDocuments: true,
                },
            }),

            this.prisma.purchaseAlert.findMany({
                take: 6,
                where: {
                    resolved: false,
                    purchase: {
                        storeId: storeFilter,
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                include: {
                    purchase: {
                        include: {
                            store: true,
                        },
                    },
                },
            }),

            this.prisma.purchase.findMany({
                take: 5,
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.WAITING_APPROVAL,
                },
                orderBy: {
                    createdAt: 'asc',
                },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                },
            }),

            this.prisma.purchase.findMany({
                take: 5,
                where: {
                    ...purchaseWhere,
                    status: PurchaseStatus.WAITING_RECEIPT,
                },
                orderBy: {
                    createdAt: 'asc',
                },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                },
            }),

            this.prisma.purchase.findMany({
                take: 5,
                where: {
                    ...purchaseWhere,
                    status: {
                        in: [
                            PurchaseStatus.WAITING_INVOICE,
                            PurchaseStatus.HAS_COUPON_ONLY,
                        ],
                    },
                },
                orderBy: {
                    createdAt: 'asc',
                },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                },
            }),

            this.prisma.purchase.findMany({
                take: 5,
                where: {
                    ...purchaseWhere,
                    status:
                        PurchaseStatus.RECEIVED_WITH_DIFFERENCE,
                },
                orderBy: {
                    createdAt: 'asc',
                },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                    checkedBy: true,
                    receipts: {
                        orderBy: {
                            createdAt: 'desc',
                        },
                        take: 1,
                    },
                },
            }),
        ]);

        const billsDueTodayTotal = billsDueTodayValues.reduce(
            (sum, item) => sum + Number(item.value),
            0,
        );

        const billsDueWeekTotal = billsDueWeekValues.reduce(
            (sum, item) => sum + Number(item.value),
            0,
        );

        const overdueBillsTotal = overdueBillValues.reduce(
            (sum, item) => sum + Number(item.value),
            0,
        );

        const cardPurchasesTotal = totalCardPurchases.reduce(
            (sum, item) => sum + Number(item.value),
            0,
        );

        const teamBoardMap = new Map<string, TeamTaskStat>();

        for (const occurrence of teamTaskOccurrences as Array<{
            status: TaskOccurrenceStatus;
            task: { assignedTo: { id: string; name: string } | null };
        }>) {
            const assignee = occurrence.task.assignedTo;

            if (!assignee) continue;

            if (!teamBoardMap.has(assignee.id)) {
                teamBoardMap.set(assignee.id, {
                    userId: assignee.id,
                    userName: assignee.name,
                    aFazer: 0,
                    emAndamento: 0,
                    pausada: 0,
                    atraso: 0,
                    concluidas: 0,
                });
            }

            const stat = teamBoardMap.get(assignee.id)!;

            if (occurrence.status === TaskOccurrenceStatus.PENDING) {
                stat.aFazer += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.IN_PROGRESS) {
                stat.emAndamento += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.PAUSED) {
                stat.pausada += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.LATE) {
                stat.atraso += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.DONE) {
                stat.concluidas += 1;
            }
        }

        const taskTeamBoard = Array.from(teamBoardMap.values()).sort(
            (a, b) => a.userName.localeCompare(b.userName),
        );

        const pendingTasks = [
            ...pendingApprovalPurchases.map((purchase) => ({
                id: `approval-${purchase.id}`,
                purchaseId: purchase.id,
                type: 'WAITING_APPROVAL',
                title: 'Aprovar compra',
                description: purchase.description,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
                href: `/purchases/${purchase.id}`,
            })),

            ...pendingReceiptPurchases.map((purchase) => ({
                id: `receipt-${purchase.id}`,
                purchaseId: purchase.id,
                type: 'WAITING_RECEIPT',
                title: 'Receber mercadoria',
                description: purchase.description,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
                href: `/purchases/${purchase.id}`,
            })),

            ...pendingInvoicePurchases.map((purchase) => ({
                id: `invoice-${purchase.id}`,
                purchaseId: purchase.id,
                type: 'WAITING_INVOICE',
                title: 'Anexar nota fiscal',
                description: purchase.description,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
                href: `/purchases/${purchase.id}`,
            })),

            ...divergencePurchases.map((purchase) => ({
                id: `difference-${purchase.id}`,
                purchaseId: purchase.id,
                type: 'RECEIVED_WITH_DIFFERENCE',
                title: 'Resolver divergência',
                description: purchase.description,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
                href: `/purchases/${purchase.id}`,
            })),
        ]
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime(),
            )
            .slice(0, 10);

        return {
            operational: {
                totalPurchases,
                waitingApproval,
                waitingReceipt,
                receivedWithDifference,
                waitingInvoice,
                couponOnly,
                purchasesWithoutInvoice:
                    waitingInvoice + couponOnly,
            },

            today: {
                created: purchasesCreatedToday,
                received: purchasesReceivedToday,
                closed: purchasesClosedToday,
                open:
                    waitingApproval +
                    waitingReceipt +
                    receivedWithDifference +
                    waitingInvoice +
                    couponOnly,
            },

            financial: {
                billsDueToday,
                billsDueTodayTotal,

                billsDueWeek,
                billsDueWeekTotal,

                overdueBills,
                overdueBillsTotal,

                cardPurchasesTotal,
            },

            alerts: {
                critical: criticalAlerts,
                unreadNotifications,
            },

            services: {
                nfCountMonth: serviceNfCountMonth,
            },

            losses: {
                countMonth: lossesCountMonth,
            },

            tasks: {
                pendingToday: myPendingTasks,
                team: taskTeamBoard,
            },

            pendingTasks,
            recentPurchases,
            recentAlerts,
        };
    }

    async badges(user: any, storeId?: string) {
        const storeFilter = this.resolveStoreFilter(user, storeId);

        const [approvals, alerts, notifications] =
            await Promise.all([
                this.prisma.purchase.count({
                    where: {
                        storeId: storeFilter,
                        status:
                            PurchaseStatus.WAITING_APPROVAL,
                    },
                }),

                this.prisma.purchaseAlert.count({
                    where: {
                        resolved: false,
                        purchase: {
                            storeId: storeFilter,
                        },
                    },
                }),

                this.prisma.notification.count({
                    where: {
                        read: false,
                        OR: [
                            {
                                userId: user.id,
                            },
                            {
                                userId: null,
                            },
                        ],
                    },
                }),
            ]);

        return {
            approvals,
            alerts,
            notifications,
        };
    }
}