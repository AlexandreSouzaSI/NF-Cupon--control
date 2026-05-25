import { Injectable } from '@nestjs/common';
import { PurchaseStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    async suppliers() {
        const suppliers = await this.prisma.supplier.findMany({
            where: { active: true },
            include: {
                purchases: {
                    include: {
                        fiscalDocuments: true,
                        store: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return suppliers.map((supplier) => {
            const totalValue = supplier.purchases.reduce(
                (sum, purchase) => sum + Number(purchase.value),
                0,
            );

            const waitingInvoices = supplier.purchases.filter(
                (purchase) =>
                    purchase.status === PurchaseStatus.WAITING_INVOICE,
            ).length;

            const pendingApprovals = supplier.purchases.filter(
                (purchase) =>
                    purchase.status === PurchaseStatus.PENDING_APPROVAL,
            ).length;

            return {
                id: supplier.id,
                name: supplier.name,
                cnpj: supplier.cnpj,
                totalPurchases: supplier.purchases.length,
                totalValue,
                waitingInvoices,
                pendingApprovals,
            };
        });
    }

    async stores(filters?: {
        startDate?: string;
        endDate?: string;
    }) {
        const purchases = await this.prisma.purchase.findMany({
            where: {
                createdAt: {
                    gte: filters?.startDate ? new Date(filters.startDate) : undefined,
                    lte: filters?.endDate ? new Date(filters.endDate) : undefined,
                },
            },
            include: {
                store: true,
                supplier: true,
                card: true,
                fiscalDocuments: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const grouped = new Map<string, any>();

        for (const purchase of purchases) {
            const storeId = purchase.store.id;

            if (!grouped.has(storeId)) {
                grouped.set(storeId, {
                    storeId,
                    storeName: purchase.store.name,
                    totalPurchases: 0,
                    totalValue: 0,
                    pendingApprovals: 0,
                    waitingInvoices: 0,
                    invoiceLinked: 0,
                    rejected: 0,
                });
            }

            const item = grouped.get(storeId);

            item.totalPurchases += 1;
            item.totalValue += Number(purchase.value);

            if (purchase.status === 'PENDING_APPROVAL') {
                item.pendingApprovals += 1;
            }

            if (purchase.status === 'WAITING_INVOICE') {
                item.waitingInvoices += 1;
            }

            if (purchase.status === 'INVOICE_LINKED') {
                item.invoiceLinked += 1;
            }

            if (purchase.status === 'REJECTED') {
                item.rejected += 1;
            }
        }

        return Array.from(grouped.values());
    }

    async cards(filters?: {
        startDate?: string;
        endDate?: string;
    }) {
        const purchases = await this.prisma.purchase.findMany({
            where: {
                cardId: {
                    not: null,
                },
                createdAt: {
                    gte: filters?.startDate ? new Date(filters.startDate) : undefined,
                    lte: filters?.endDate ? new Date(filters.endDate) : undefined,
                },
            },
            include: {
                card: true,
                store: true,
                supplier: true,
                fiscalDocuments: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        const grouped = new Map<string, any>();

        for (const purchase of purchases) {
            if (!purchase.card) {
                continue;
            }

            const cardId = purchase.card.id;

            if (!grouped.has(cardId)) {
                grouped.set(cardId, {
                    cardId,
                    cardName: purchase.card.name,
                    lastDigits: purchase.card.lastDigits,
                    storeName: purchase.store.name,
                    totalPurchases: 0,
                    totalValue: 0,
                    waitingInvoices: 0,
                    invoiceLinked: 0,
                    purchases: [],
                });
            }

            const item = grouped.get(cardId);

            item.totalPurchases += 1;
            item.totalValue += Number(purchase.value);

            if (purchase.status === 'WAITING_INVOICE') {
                item.waitingInvoices += 1;
            }

            if (purchase.status === 'INVOICE_LINKED') {
                item.invoiceLinked += 1;
            }

            item.purchases.push({
                id: purchase.id,
                description: purchase.description,
                value: Number(purchase.value),
                status: purchase.status,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
            });
        }

        return Array.from(grouped.values());
    }
}