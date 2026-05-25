import { Injectable } from '@nestjs/common';
import { PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async summary() {
        const [
            totalPurchases,
            pendingApprovals,
            waitingInvoices,
            rejectedPurchases,
            approvedPurchases,
            criticalAlerts,
            unreadNotifications,
            recentPurchases,
            recentAlerts,
        ] = await Promise.all([
            this.prisma.purchase.count(),

            this.prisma.purchase.count({
                where: { status: PurchaseStatus.PENDING_APPROVAL },
            }),

            this.prisma.purchase.count({
                where: { status: PurchaseStatus.WAITING_INVOICE },
            }),

            this.prisma.purchase.count({
                where: { status: PurchaseStatus.REJECTED },
            }),

            this.prisma.purchase.findMany({
                where: {
                    status: {
                        in: [
                            PurchaseStatus.APPROVED,
                            PurchaseStatus.PURCHASED,
                            PurchaseStatus.WAITING_INVOICE,
                            PurchaseStatus.INVOICE_LINKED,
                            PurchaseStatus.CHECKED,
                            PurchaseStatus.CLOSED,
                        ],
                    },
                },
                select: { value: true },
            }),

            this.prisma.purchaseAlert.count({
                where: {
                    resolved: false,
                    level: 'CRITICAL',
                },
            }),

            this.prisma.notification.count({
                where: { read: false },
            }),

            this.prisma.purchase.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    store: true,
                    supplier: true,
                    createdBy: true,
                },
            }),

            this.prisma.purchaseAlert.findMany({
                take: 5,
                where: { resolved: false },
                orderBy: { createdAt: 'desc' },
                include: {
                    purchase: true,
                },
            }),
        ]);

        const approvedTotal = approvedPurchases.reduce(
            (sum, purchase) => sum + Number(purchase.value),
            0,
        );

        return {
            totalPurchases,
            pendingApprovals,
            waitingInvoices,
            rejectedPurchases,
            approvedTotal,
            criticalAlerts,
            unreadNotifications,
            recentPurchases,
            recentAlerts,
        };
    }

    async badges() {
        const [approvals, alerts, notifications] =
            await Promise.all([
                this.prisma.purchase.count({
                    where: {
                        status: 'PENDING_APPROVAL',
                    },
                }),

                this.prisma.purchaseAlert.count({
                    where: {
                        resolved: false,
                    },
                }),

                this.prisma.notification.count({
                    where: {
                        read: false,
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