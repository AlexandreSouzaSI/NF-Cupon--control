import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    ApprovalStatus,
    FiscalDocumentType,
    NotificationType,
    PaymentMethod,
    PurchaseAlertLevel,
    PurchaseAlertType,
    PurchaseCategory,
    PurchaseHistoryAction,
    PurchaseStatus,
    ReceiptStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from 'prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';

@Injectable()
export class PurchasesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

    private getAllowedStoreIds(user: any) {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map((item: any) => item.storeId || item.store?.id) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) return;

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    private canCreatePurchase(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
            UserRole.COMPRADOR,
        ].includes(user.role);
    }

    private canApprovePurchase(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
        ].includes(user.role);
    }

    private canReceivePurchase(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
            UserRole.ESTOQUISTA,
        ].includes(user.role);
    }

    private shouldRequireApproval(dto: CreatePurchaseDto, user: any) {
        if (dto.category === PurchaseCategory.SUPPLIER_ORDER && user.role === UserRole.COMPRADOR) {
            return false;
        }

        if (dto.category === PurchaseCategory.SUPPLIER_ORDER && user.role === UserRole.ADMINISTRATIVO) {
            return false;
        }

        return true;
    }

    private getInitialStatus(dto: CreatePurchaseDto, user: any) {
        const requiresApproval = this.shouldRequireApproval(dto, user);

        if (requiresApproval) {
            return PurchaseStatus.WAITING_APPROVAL;
        }

        if (dto.category === PurchaseCategory.AVULSA_CARD) {
            return PurchaseStatus.WAITING_INVOICE;
        }

        return PurchaseStatus.WAITING_RECEIPT;
    }

    async create(dto: CreatePurchaseDto, user: any) {
        if (!this.canCreatePurchase(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para cadastrar compras.',
            );
        }

        this.ensureStoreAccess(dto.storeId, user);

        const requiresApproval = this.shouldRequireApproval(dto, user);
        const status = this.getInitialStatus(dto, user);

        const purchase = await this.prisma.purchase.create({
            data: {
                description: dto.description,
                value: dto.value,
                method: dto.method,
                notes: dto.notes,
                status,
                category: dto.category || PurchaseCategory.SUPPLIER_ORDER,
                origin: dto.origin,
                externalOrderCode: dto.externalOrderCode,
                requiresApproval,
                storeId: dto.storeId,
                supplierId: dto.supplierId,
                cardId: dto.cardId,
                invoiceResponsibleId: dto.invoiceResponsibleId,
                purchasedAt: dto.purchasedAt
                    ? new Date(`${dto.purchasedAt}T12:00:00.000Z`)
                    : undefined,

                dueDate: dto.dueDate
                    ? new Date(`${dto.dueDate}T12:00:00.000Z`)
                    : undefined,
                createdById: user.id,
                items: dto.items?.length
                    ? {
                        create: dto.items.map((item) => ({
                            name: item.name,
                            quantity: item.quantity,
                            unit: item.unit,
                            unitPrice: item.unitPrice,
                            total: item.total,
                            notes: item.notes,
                        })),
                    }
                    : undefined,
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            purchase.id,
            user.id,
            PurchaseHistoryAction.CREATED,
            requiresApproval
                ? 'Compra criada aguardando aprovação.'
                : 'Compra criada aguardando recebimento.',
        );

        await this.generateAlertsForPurchase(purchase);

        await this.notificationsService.create({
            title: requiresApproval
                ? 'Compra aguardando aprovação'
                : 'Nova compra cadastrada',
            message: `Compra "${purchase.description}" no valor de R$ ${Number(
                purchase.value,
            ).toFixed(2)} foi criada.`,
            type: requiresApproval
                ? NotificationType.WAITING_APPROVAL
                : NotificationType.PURCHASE_CREATED,
        });

        return purchase;
    }

    async findAll(
        user: any,
        filters?: {
            status?: PurchaseStatus;
            storeId?: string;
            supplierId?: string;
            category?: PurchaseCategory;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.purchase.findMany({
            where: {
                status: filters?.status,
                supplierId: filters?.supplierId,
                category: filters?.category,
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds
                        ? {
                            in: allowedStoreIds,
                        }
                        : undefined),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        await this.ensurePurchaseAccess(id, user);

        const purchase = await this.prisma.purchase.findUnique({
            where: { id },
            include: this.defaultInclude(),
        });

        if (!purchase) {
            throw new NotFoundException('Compra não encontrada.');
        }

        return purchase;
    }

    async approve(purchaseId: string, user: any, comment?: string) {
        if (!this.canApprovePurchase(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para aprovar compras.',
            );
        }

        const purchase = await this.ensurePurchaseAccess(purchaseId, user);

        if (purchase.status !== PurchaseStatus.WAITING_APPROVAL) {
            throw new ForbiddenException(
                'Essa compra não está aguardando aprovação.',
            );
        }

        const updated = await this.prisma.purchase.update({
            where: { id: purchaseId },
            data: {
                status: PurchaseStatus.APPROVED,
                approvedById: user.id,
                approvedAt: new Date(),
                approvals: {
                    create: {
                        approverId: user.id,
                        status: ApprovalStatus.APPROVED,
                        comment,
                    },
                },
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            purchaseId,
            user.id,
            PurchaseHistoryAction.APPROVED,
            comment || 'Compra aprovada.',
        );

        await this.notificationsService.create({
            title: 'Compra aprovada',
            message: `A compra "${updated.description}" foi aprovada.`,
            type: NotificationType.PURCHASE_APPROVED,
        });

        return this.prisma.purchase.update({
            where: { id: purchaseId },
            data: {
                status:
                    updated.category === PurchaseCategory.AVULSA_CARD
                        ? PurchaseStatus.WAITING_INVOICE
                        : PurchaseStatus.WAITING_RECEIPT,
            },
            include: this.defaultInclude(),
        });
    }

    async reject(purchaseId: string, user: any, comment?: string) {
        if (!this.canApprovePurchase(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para reprovar compras.',
            );
        }

        const purchase = await this.ensurePurchaseAccess(purchaseId, user);

        if (purchase.status !== PurchaseStatus.WAITING_APPROVAL) {
            throw new ForbiddenException(
                'Essa compra não está aguardando aprovação.',
            );
        }

        const updated = await this.prisma.purchase.update({
            where: { id: purchaseId },
            data: {
                status: PurchaseStatus.REJECTED,
                rejectedAt: new Date(),
                rejectionReason: comment,
                approvals: {
                    create: {
                        approverId: user.id,
                        status: ApprovalStatus.REJECTED,
                        comment,
                    },
                },
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            purchaseId,
            user.id,
            PurchaseHistoryAction.REJECTED,
            comment || 'Compra reprovada.',
        );

        await this.notificationsService.create({
            title: 'Compra reprovada',
            message: `A compra "${updated.description}" foi reprovada.`,
            type: NotificationType.PURCHASE_REJECTED,
        });

        return updated;
    }

    async findPendingApprovals(user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        return this.prisma.purchase.findMany({
            where: {
                status: PurchaseStatus.WAITING_APPROVAL,
                storeId: allowedStoreIds
                    ? {
                        in: allowedStoreIds,
                    }
                    : undefined,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: this.defaultInclude(),
        });
    }

    async addFiscalDocument(
        purchaseId: string,
        dto: CreateFiscalDocumentDto,
        user?: any,
    ) {
        if (user) {
            await this.ensurePurchaseAccess(purchaseId, user);
        }

        const document = await this.prisma.fiscalDocument.create({
            data: {
                purchaseId,
                type: dto.type,
                number: dto.number,
                accessKey: dto.accessKey,
                fileUrl: dto.fileUrl,
                value: dto.value,
                linkedToId: dto.linkedToId,
                uploadedById: user?.id,
            },
        });

        const newStatus =
            dto.type === FiscalDocumentType.COUPON
                ? PurchaseStatus.HAS_COUPON_ONLY
                : PurchaseStatus.HAS_INVOICE;

        await this.prisma.purchase.update({
            where: { id: purchaseId },
            data: {
                status: newStatus,
            },
        });

        await this.createHistory(
            purchaseId,
            user?.id,
            dto.type === FiscalDocumentType.COUPON
                ? PurchaseHistoryAction.COUPON_UPLOADED
                : PurchaseHistoryAction.INVOICE_UPLOADED,
            dto.type === FiscalDocumentType.COUPON
                ? 'Cupom fiscal anexado.'
                : 'Nota fiscal anexada.',
        );

        if (dto.type === FiscalDocumentType.COUPON) {
            await this.notificationsService.create({
                title: 'Cupom aguardando NF',
                message: 'Um cupom foi enviado e agora aguarda nota fiscal.',
                type: NotificationType.WAITING_INVOICE,
            });
        }

        return document;
    }

    async findFiscalDocuments(purchaseId: string, user?: any) {
        if (user) {
            await this.ensurePurchaseAccess(purchaseId, user);
        }

        return this.prisma.fiscalDocument.findMany({
            where: { purchaseId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findWaitingInvoices(user?: any) {
        const allowedStoreIds = user ? this.getAllowedStoreIds(user) : undefined;

        return this.prisma.purchase.findMany({
            where: {
                OR: [
                    { status: PurchaseStatus.WAITING_INVOICE },
                    { status: PurchaseStatus.HAS_COUPON_ONLY },
                ],
                storeId: allowedStoreIds
                    ? {
                        in: allowedStoreIds,
                    }
                    : undefined,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: this.defaultInclude(),
        });
    }

    async check(id: string, user?: any) {
        if (user) {
            await this.ensurePurchaseAccess(id, user);
        }

        const purchase = await this.prisma.purchase.update({
            where: { id },
            data: {
                status: PurchaseStatus.RECEIVED_OK,
                checkedById: user?.id,
                checkedAt: new Date(),
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            id,
            user?.id,
            PurchaseHistoryAction.RECEIVED,
            'Compra conferida e marcada como recebida.',
        );

        return purchase;
    }

    async close(id: string, user?: any) {
        if (user) {
            await this.ensurePurchaseAccess(id, user);
        }

        const purchase = await this.prisma.purchase.update({
            where: { id },
            data: {
                status: PurchaseStatus.CLOSED,
                closedById: user?.id,
                closedAt: new Date(),
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            id,
            user?.id,
            PurchaseHistoryAction.CLOSED,
            'Compra encerrada.',
        );

        return purchase;
    }

    private async ensurePurchaseAccess(purchaseId: string, user: any) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id: purchaseId },
            select: {
                id: true,
                storeId: true,
                status: true,
                category: true,
            },
        });

        if (!purchase) {
            throw new NotFoundException('Compra não encontrada.');
        }

        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (allowedStoreIds && !allowedStoreIds.includes(purchase.storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }

        return purchase;
    }

    private async createHistory(
        purchaseId: string,
        userId: string | undefined,
        action: PurchaseHistoryAction,
        comment?: string,
    ) {
        return this.prisma.purchaseHistory.create({
            data: {
                purchaseId,
                userId,
                action,
                comment,
            },
        });
    }

    private async generateAlertsForPurchase(purchase: {
        id: string;
        value: any;
        supplierId?: string | null;
        description: string;
        method: PaymentMethod;
    }) {
        const alerts: {
            type: PurchaseAlertType;
            level: PurchaseAlertLevel;
            title: string;
            description: string;
            purchaseId: string;
        }[] = [];

        const value = Number(purchase.value);
        const description = purchase.description.toLowerCase();

        if (value >= 1000) {
            alerts.push({
                type: PurchaseAlertType.HIGH_VALUE,
                level: PurchaseAlertLevel.CRITICAL,
                title: 'Compra de valor alto',
                description: `Compra registrada com valor de R$ ${value.toFixed(
                    2,
                )}. Requer atenção especial.`,
                purchaseId: purchase.id,
            });
        }

        if (!purchase.supplierId) {
            alerts.push({
                type: PurchaseAlertType.MISSING_SUPPLIER,
                level: PurchaseAlertLevel.WARNING,
                title: 'Compra sem fornecedor',
                description:
                    'A compra foi registrada sem fornecedor. Isso dificulta a conferência da NF.',
                purchaseId: purchase.id,
            });
        }

        const suspiciousWords = [
            'manutenção',
            'reparo',
            'obra',
            'cimento',
            'rejunte',
            'porcelanato',
            'ferramenta',
            'disco',
        ];

        const hasSuspiciousWord = suspiciousWords.some((word) =>
            description.includes(word),
        );

        if (hasSuspiciousWord) {
            alerts.push({
                type: PurchaseAlertType.SUSPICIOUS_DESCRIPTION,
                level: PurchaseAlertLevel.WARNING,
                title: 'Descrição sensível',
                description:
                    'A descrição da compra contém termos que podem exigir conferência manual.',
                purchaseId: purchase.id,
            });
        }

        if (purchase.method === PaymentMethod.CREDIT_CARD && value >= 500) {
            alerts.push({
                type: PurchaseAlertType.CARD_USAGE,
                level: PurchaseAlertLevel.WARNING,
                title: 'Uso relevante de cartão',
                description:
                    'Compra no cartão com valor elevado. Conferir com a fatura posteriormente.',
                purchaseId: purchase.id,
            });
        }

        if (alerts.length > 0) {
            await this.prisma.purchaseAlert.createMany({
                data: alerts,
            });
        }
    }

    private defaultInclude() {
        return {
            store: true,
            supplier: true,
            card: true,
            createdBy: true,
            updatedBy: true,
            approvedBy: true,
            checkedBy: true,
            invoiceResponsible: true,
            closedBy: true,
            items: true,
            receipts: {
                include: {
                    receivedBy: true,
                },
                orderBy: {
                    createdAt: 'asc' as const,
                },
            },
            approvals: {
                include: {
                    approver: true,
                },
                orderBy: {
                    createdAt: 'asc' as const,
                },
            },
            fiscalDocuments: {
                orderBy: {
                    createdAt: 'asc' as const,
                },
            },
            histories: {
                include: {
                    user: true,
                },
                orderBy: {
                    createdAt: 'asc' as const,
                },
            },
            bills: true,
            purchaseAlerts: true,
        };
    }

    private buildReceiptHistoryComment(
        status: ReceiptStatus,
    ) {
        switch (status) {
            case ReceiptStatus.OK:
                return 'Compra recebida sem divergências.';

            case ReceiptStatus.MISSING_ITEMS:
                return 'Compra recebida com itens faltando.';

            case ReceiptStatus.EXTRA_ITEMS:
                return 'Compra recebida com itens a mais.';

            case ReceiptStatus.PARTIAL:
                return 'Compra recebida parcialmente ou com mais de um tipo de divergência.';

            default:
                return 'Recebimento registrado.';
        }
    }

    async receive(
        purchaseId: string,
        dto: ReceivePurchaseDto,
        user: any,
    ) {
        if (!this.canReceivePurchase(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para receber compras.',
            );
        }

        const purchaseAccess = await this.ensurePurchaseAccess(
            purchaseId,
            user,
        );

        const allowedStatuses: PurchaseStatus[] = [
            PurchaseStatus.APPROVED,
            PurchaseStatus.WAITING_RECEIPT,
            PurchaseStatus.RECEIVED_WITH_DIFFERENCE,
        ];

        if (!allowedStatuses.includes(purchaseAccess.status)) {
            throw new BadRequestException(
                'Essa compra não está disponível para recebimento.',
            );
        }

        const purchase = await this.prisma.purchase.findUnique({
            where: {
                id: purchaseId,
            },
            include: {
                items: true,
                fiscalDocuments: true,
            },
        });

        if (!purchase) {
            throw new NotFoundException('Compra não encontrada.');
        }

        if (!dto.itemReceipts || dto.itemReceipts.length === 0) {
            throw new BadRequestException(
                'Informe os itens recebidos.',
            );
        }

        const purchaseItemIds = new Set(
            purchase.items.map((item) => item.id),
        );

        for (const receivedItem of dto.itemReceipts) {
            if (!purchaseItemIds.has(receivedItem.itemId)) {
                throw new BadRequestException(
                    `O item ${receivedItem.itemId} não pertence a esta compra.`,
                );
            }

            if (Number(receivedItem.receivedQuantity) < 0) {
                throw new BadRequestException(
                    'A quantidade recebida não pode ser negativa.',
                );
            }
        }

        /*
         * Calcula automaticamente se existem diferenças.
         *
         * O status informado pelo front é mantido como referência,
         * mas as quantidades são a principal fonte de verdade.
         */

        let hasMissingItems = false;
        let hasExtraItems = false;
        let hasPartialItems = false;

        for (const purchaseItem of purchase.items) {
            const receivedItem = dto.itemReceipts.find(
                (item) => item.itemId === purchaseItem.id,
            );

            const orderedQuantity = Number(purchaseItem.quantity);
            const receivedQuantity = receivedItem
                ? Number(receivedItem.receivedQuantity)
                : 0;

            if (receivedQuantity < orderedQuantity) {
                hasMissingItems = true;
            }

            if (receivedQuantity > orderedQuantity) {
                hasExtraItems = true;
            }

            if (
                receivedQuantity > 0 &&
                receivedQuantity < orderedQuantity
            ) {
                hasPartialItems = true;
            }
        }

        let receiptStatus: ReceiptStatus = dto.status;

        if (hasMissingItems && hasExtraItems) {
            receiptStatus = ReceiptStatus.PARTIAL;
        } else if (hasExtraItems) {
            receiptStatus = ReceiptStatus.EXTRA_ITEMS;
        } else if (hasMissingItems) {
            receiptStatus = hasPartialItems
                ? ReceiptStatus.PARTIAL
                : ReceiptStatus.MISSING_ITEMS;
        } else {
            receiptStatus = ReceiptStatus.OK;
        }

        const hasDifference =
            receiptStatus !== ReceiptStatus.OK;

        const newPurchaseStatus = hasDifference
            ? PurchaseStatus.RECEIVED_WITH_DIFFERENCE
            : PurchaseStatus.RECEIVED_OK;

        const result = await this.prisma.$transaction(
            async (tx) => {
                for (const receivedItem of dto.itemReceipts) {
                    await tx.purchaseItem.update({
                        where: {
                            id: receivedItem.itemId,
                        },
                        data: {
                            receivedQuantity:
                                receivedItem.receivedQuantity,
                            notes:
                                receivedItem.notes || undefined,
                        },
                    });
                }

                const receipt = await tx.purchaseReceipt.create({
                    data: {
                        purchaseId,
                        receivedById: user.id,
                        status: receiptStatus,
                        notes: dto.notes || undefined,
                        finalValue:
                            dto.finalValue !== undefined
                                ? dto.finalValue
                                : purchase.value,
                    },
                });

                const updatedPurchase = await tx.purchase.update({
                    where: {
                        id: purchaseId,
                    },
                    data: {
                        status: newPurchaseStatus,
                        checkedById: user.id,
                        checkedAt: new Date(),
                        value:
                            dto.finalValue !== undefined
                                ? dto.finalValue
                                : purchase.value,
                    },
                    include: this.defaultInclude(),
                });

                await tx.purchaseHistory.create({
                    data: {
                        purchaseId,
                        userId: user.id,
                        action: PurchaseHistoryAction.RECEIVED,
                        comment:
                            dto.notes ||
                            this.buildReceiptHistoryComment(
                                receiptStatus,
                            ),
                    },
                });

                return {
                    receipt,
                    purchase: updatedPurchase,
                };
            },
        );

        return result;
    }
}