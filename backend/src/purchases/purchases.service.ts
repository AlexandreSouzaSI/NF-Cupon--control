import { ForbiddenException, Injectable } from '@nestjs/common';

import {
    ApprovalStatus,
    FiscalDocumentType,
    PaymentMethod,
    PurchaseAlertLevel,
    PurchaseAlertType,
    PurchaseHistoryAction,
    PurchaseStatus,
} from '@prisma/client';


import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PrismaService } from 'prisma/prisma.service';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class PurchasesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

    private getAllowedStoreIds(user: any) {
        if (user.role === 'ADMIN') return undefined;

        return (
            user.userStores?.map((item: any) => item.storeId || item.store?.id) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        if (user.role === 'ADMIN') return;

        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds?.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta empresa');
        }
    }

    async create(
        dto: CreatePurchaseDto,
        user: any,
    ) {
        this.ensureStoreAccess(dto.storeId, user);
        if (!['ADMIN', 'BUYER'].includes(user.role)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para criar requisições de compra',
            );
        }
        const rule = await this.prisma.approvalRule.findFirst({
            where: {
                active: true,
                minValue: {
                    lte: dto.value,
                },
                AND: [
                    {
                        OR: [
                            {
                                maxValue: null,
                            },
                            {
                                maxValue: {
                                    gte: dto.value,
                                },
                            },
                        ],
                    },
                    {
                        OR: [
                            {
                                storeId: dto.storeId,
                            },
                            {
                                storeId: null,
                            },
                        ],
                    },
                ],
            },
            orderBy: {
                minValue: 'desc',
            },
        });

        let status: PurchaseStatus = PurchaseStatus.PENDING_APPROVAL;

        if (rule?.level === 'AUTO') {
            status = PurchaseStatus.APPROVED;
        }

        const purchase = await this.prisma.purchase.create({
            data: {
                description: dto.description,
                value: dto.value,
                method: dto.method,
                notes: dto.notes,
                status,
                storeId: dto.storeId,
                supplierId: dto.supplierId,
                cardId: dto.cardId,
                createdById: user.id,
            },
            include: {
                store: true,
                supplier: true,
                card: true,
                createdBy: true,
            },
        });

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId: purchase.id,
                userId: user.id,
                action: PurchaseHistoryAction.CREATED,
            },
        });

        await this.generateAlertsForPurchase(purchase);

        await this.notificationsService.create({
            title: 'Nova compra registrada',
            message: `Compra "${purchase.description}" no valor de R$ ${Number(
                purchase.value,
            ).toFixed(2)} foi criada.`,
            type:
                purchase.status === PurchaseStatus.PENDING_APPROVAL
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
            include: {
                store: true,
                supplier: true,
                card: true,
                createdBy: true,
                fiscalDocuments: true,
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

    async approve(
        purchaseId: string,
        user: any,
        comment?: string,
    ) {

        if (!['ADMIN', 'APPROVER'].includes(user.role)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para aprovar compras',
            );
        }

        const purchase = await this.prisma.purchase.update({
            where: {
                id: purchaseId,
            },

            data: {
                status: PurchaseStatus.APPROVED,

                approvals: {
                    create: {
                        approverId: user.id,
                        status: 'APPROVED',
                        comment,
                    },
                },
            },

            include: {
                store: true,
                createdBy: true,
            },
        });

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId,
                userId: user.id,
                action: PurchaseHistoryAction.APPROVED,
                comment,
            },
        });

        await this.notificationsService.create({
            title: 'Compra aprovada',
            message: `A compra "${purchase.description}" foi aprovada.`,
            type: NotificationType.PURCHASE_APPROVED,
        });

        return purchase;
    }

    async reject(
        purchaseId: string,
        user: any,
        comment?: string,
    ) {

        if (!['ADMIN', 'APPROVER'].includes(user.role)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para reprovar compras',
            );
        }
        const purchase = await this.prisma.purchase.update({
            where: {
                id: purchaseId,
            },

            data: {
                status: PurchaseStatus.REJECTED,

                approvals: {
                    create: {
                        approverId: user.id,
                        status: 'REJECTED',
                        comment,
                    },
                },
            },

            include: {
                store: true,
                createdBy: true,
            },
        });

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId,
                userId: user.id,
                action: PurchaseHistoryAction.REJECTED,
                comment,
            },
        });

        await this.notificationsService.create({
            title: 'Compra reprovada',
            message: `A compra "${purchase.description}" foi reprovada.`,
            type: NotificationType.PURCHASE_REJECTED,
        });

        return purchase;
    }

    async findPendingApprovals() {
        return this.prisma.purchase.findMany({
            where: {
                status: PurchaseStatus.PENDING_APPROVAL,
            },

            orderBy: {
                createdAt: 'desc',
            },

            include: {
                store: true,
                supplier: true,
                card: true,
                createdBy: true,
            },
        });
    }

    async addFiscalDocument(
        purchaseId: string,
        dto: CreateFiscalDocumentDto,
    ) {
        const document = await this.prisma.fiscalDocument.create({
            data: {
                purchaseId,
                type: dto.type,
                number: dto.number,
                accessKey: dto.accessKey,
                fileUrl: dto.fileUrl,
                value: dto.value,
                linkedToId: dto.linkedToId,
            },
        });

        if (dto.type === 'COUPON') {
            await this.prisma.purchase.update({
                where: { id: purchaseId },
                data: {
                    status: PurchaseStatus.WAITING_INVOICE,
                },
            });
        }

        if (dto.type === 'INVOICE') {
            await this.prisma.purchase.update({
                where: { id: purchaseId },
                data: {
                    status: PurchaseStatus.INVOICE_LINKED,
                },
            });
        }

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId,
                action:
                    dto.type === FiscalDocumentType.COUPON
                        ? PurchaseHistoryAction.COUPON_UPLOADED
                        : PurchaseHistoryAction.INVOICE_UPLOADED,
            },
        });

        if (dto.type === FiscalDocumentType.COUPON) {
            await this.notificationsService.create({
                title: 'Cupom aguardando NF',
                message: 'Um cupom foi enviado e agora aguarda nota fiscal.',
                type: NotificationType.WAITING_INVOICE,
            });
        }

        return document;
    }

    async findFiscalDocuments(purchaseId: string) {
        return this.prisma.fiscalDocument.findMany({
            where: { purchaseId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findWaitingInvoices() {
        return this.prisma.purchase.findMany({
            where: {
                status: PurchaseStatus.WAITING_INVOICE,
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                store: true,
                supplier: true,
                card: true,
                createdBy: true,
                fiscalDocuments: true,
            },
        });
    }

    async check(id: string) {
        const purchase = await this.prisma.purchase.update({
            where: { id },
            data: {
                status: PurchaseStatus.CHECKED,
            },
        });

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId: id,
                action: PurchaseHistoryAction.CHECKED,
            },
        });

        return purchase;
    }

    async close(id: string) {
        const purchase = await this.prisma.purchase.update({
            where: { id },
            data: {
                status: PurchaseStatus.CLOSED,
            },
        });

        await this.prisma.purchaseHistory.create({
            data: {
                purchaseId: id,
                action: PurchaseHistoryAction.CLOSED,
            },
        });

        return purchase;
    }

    async findOne(id: string) {
        return this.prisma.purchase.findUnique({
            where: { id },
            include: {
                store: true,
                supplier: true,
                card: true,
                createdBy: true,
                approvals: {
                    include: {
                        approver: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                fiscalDocuments: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                histories: {
                    include: {
                        user: true,
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });
    }
}