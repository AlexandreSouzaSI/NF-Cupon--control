import { ForbiddenException, Injectable } from '@nestjs/common';
import { FiscalDocumentType, PurchaseStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const NOT_APPLICABLE_FOR_INVOICE_STATUSES: PurchaseStatus[] = [
    PurchaseStatus.DRAFT,
    PurchaseStatus.REJECTED,
    PurchaseStatus.CANCELED,
];

@Injectable()
export class ReportsService {
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

    // Mesmo helper usado no dashboard: se vier storeId, valida que o usuário
    // tem acesso; se não vier, cai no filtro padrão de lojas permitidas.
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

        return allowedStoreIds ? { in: allowedStoreIds } : undefined;
    }

    async suppliers(user: any, storeId?: string) {
        const storeFilter = this.resolveStoreFilter(user, storeId);

        const suppliers = await this.prisma.supplier.findMany({
            where: { active: true },
            include: {
                purchases: {
                    where: {
                        storeId: storeFilter,
                    },
                    include: {
                        fiscalDocuments: true,
                        store: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        return suppliers
            .filter((supplier) => supplier.purchases.length > 0)
            .map((supplier) => {
                const totalValue = supplier.purchases.reduce(
                    (sum, purchase) => sum + Number(purchase.value),
                    0,
                );

                // O status da compra é reaproveitado em várias etapas do fluxo
                // (aprovação, recebimento, fiscal), então "sem NF" é calculado
                // pelos documentos realmente anexados, não pelo status atual —
                // senão uma compra já recebida ou com cupom some da contagem.
                const waitingInvoices = supplier.purchases.filter(
                    (purchase) =>
                        !NOT_APPLICABLE_FOR_INVOICE_STATUSES.includes(
                            purchase.status,
                        ) &&
                        !purchase.fiscalDocuments.some(
                            (doc) => doc.type === FiscalDocumentType.INVOICE,
                        ),
                ).length;

                const pendingApprovals = supplier.purchases.filter(
                    (purchase) =>
                        purchase.status === PurchaseStatus.WAITING_APPROVAL,
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

    async stores(
        user: any,
        filters?: {
            startDate?: string;
            endDate?: string;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        const purchases = await this.prisma.purchase.findMany({
            where: {
                storeId: allowedStoreIds
                    ? {
                        in: allowedStoreIds,
                    }
                    : undefined,
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
                    waitingReceipt: 0,
                    waitingInvoices: 0,
                    invoiceLinked: 0,
                    canceled: 0,
                });
            }

            const item = grouped.get(storeId);

            // Mesma lógica das outras duas telas de relatório: NF é
            // calculada pelo documento anexado, não pelo status (que muda
            // de novo quando a compra vira conta a pagar/é fechada).
            const hasInvoice = purchase.fiscalDocuments.some(
                (doc) => doc.type === FiscalDocumentType.INVOICE,
            );

            item.totalPurchases += 1;
            item.totalValue += Number(purchase.value);

            if (purchase.status === PurchaseStatus.WAITING_APPROVAL) {
                item.pendingApprovals += 1;
            }

            if (purchase.status === PurchaseStatus.WAITING_RECEIPT) {
                item.waitingReceipt += 1;
            }

            if (
                !hasInvoice &&
                !NOT_APPLICABLE_FOR_INVOICE_STATUSES.includes(purchase.status)
            ) {
                item.waitingInvoices += 1;
            }

            if (hasInvoice) {
                item.invoiceLinked += 1;
            }

            if (purchase.status === PurchaseStatus.CANCELED) {
                item.canceled += 1;
            }
        }

        return Array.from(grouped.values());
    }

    async cards(
        user: any,
        filters?: {
            startDate?: string;
            endDate?: string;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        const purchases = await this.prisma.purchase.findMany({
            where: {
                storeId: allowedStoreIds
                    ? {
                        in: allowedStoreIds,
                    }
                    : undefined,
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

            // Mesma lógica do relatório de fornecedores: "sem NF" olha o
            // documento anexado de verdade, não o status (que muda por
            // outros motivos ao longo do fluxo e pode esconder a pendência).
            const hasInvoice = purchase.fiscalDocuments.some(
                (doc) => doc.type === FiscalDocumentType.INVOICE,
            );

            item.totalPurchases += 1;
            item.totalValue += Number(purchase.value);

            if (
                !hasInvoice &&
                !NOT_APPLICABLE_FOR_INVOICE_STATUSES.includes(purchase.status)
            ) {
                item.waitingInvoices += 1;
            }

            if (hasInvoice) {
                item.invoiceLinked += 1;
            }

            item.purchases.push({
                id: purchase.id,
                description: purchase.description,
                value: Number(purchase.value),
                status: purchase.status,
                hasInvoice,
                storeName: purchase.store.name,
                supplierName: purchase.supplier?.name || null,
                createdAt: purchase.createdAt,
            });
        }

        return Array.from(grouped.values());
    }
}