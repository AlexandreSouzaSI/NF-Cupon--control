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
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from 'prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { loadCertificate } from '../stores/sefaz-nfse-client';
import { fetchGoodsDistribution, parseResNFe, ufToCode } from '../stores/sefaz-nfe-client';

// Mesmo padrão dos XMLs de NF de serviço: ficam dentro de /uploads, lado a
// lado com os documentos enviados à mão.
const incomingGoodsNfPath = join(process.cwd(), 'uploads', 'purchases-nfe');

if (!existsSync(incomingGoodsNfPath)) {
    mkdirSync(incomingGoodsNfPath, { recursive: true });
}

// Mesmo limite de segurança usado na sincronização de NFS-e — evita que uma
// loja com histórico grande prenda a requisição; o NSU salvo garante que o
// próximo clique continua de onde parou.
const MAX_GOODS_SYNC_BATCHES = 25;

// Perfis que têm acesso à aba Compras (ver frontend/lib/menu.ts) — usado
// pra decidir quem recebe notificação de evento de compra. Administrativo/
// Proprietário sempre recebem (acesso global), então não precisam entrar
// nessa lista — notifyStoreAccess já cobre os dois automaticamente.
const PURCHASE_NOTIFY_ROLES: UserRole[] = [
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
];

// Cupons e NF é liberado pra todo mundo (ver menu.ts), então o aviso de
// "cupom aguardando NF" vai pros demais perfis vinculados à loja também.
const FISCAL_NOTIFY_ROLES: UserRole[] = [
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
    UserRole.FINANCEIRO,
];

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
            UserRole.ESTOQUISTA,
        ].includes(user.role);
    }

    private canApprovePurchase(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
            UserRole.COMPRADOR,
        ].includes(user.role);
    }

    private canReceivePurchase(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
            UserRole.COMPRADOR,
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

        await this.notificationsService.notifyStoreAccess({
            storeId: purchase.storeId,
            allowedRoles: PURCHASE_NOTIFY_ROLES,
            excludeUserId: user.id,
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

        await this.notificationsService.notifyStoreAccess({
            storeId: updated.storeId,
            allowedRoles: PURCHASE_NOTIFY_ROLES,
            excludeUserId: user.id,
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

        await this.notificationsService.notifyStoreAccess({
            storeId: updated.storeId,
            allowedRoles: PURCHASE_NOTIFY_ROLES,
            excludeUserId: user.id,
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

        const updatedPurchase = await this.prisma.purchase.update({
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
            await this.notificationsService.notifyStoreAccess({
                storeId: updatedPurchase.storeId,
                allowedRoles: FISCAL_NOTIFY_ROLES,
                excludeUserId: user?.id,
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

    // Busca automaticamente, direto na Sefaz (produção), as NF-e de
    // mercadoria emitidas pro CNPJ da loja desde o último NSU salvo. Não
    // cria nem altera nenhuma compra sozinho — só deixa os documentos
    // disponíveis pra conciliação manual (vinculação a uma compra já
    // cadastrada) na aba "Novas NFs".
    async syncIncomingGoodsNf(storeId: string, user: any) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        if (!store.cnpj) {
            throw new BadRequestException(
                'Cadastre o CNPJ da loja em Cadastros → Lojas antes de buscar as NFs.',
            );
        }

        if (!store.uf) {
            throw new BadRequestException(
                'Cadastre a UF da loja em Cadastros → Lojas antes de buscar as NFs.',
            );
        }

        const certificate = await this.prisma.storeCertificate.findUnique({
            where: { storeId },
        });

        if (!certificate) {
            throw new BadRequestException(
                'Essa loja não tem certificado digital cadastrado. Cadastre em Cadastros → Lojas antes de buscar as NFs.',
            );
        }

        const cert = loadCertificate(certificate.filePath, {
            cipher: certificate.passwordCipher,
            iv: certificate.passwordIv,
            authTag: certificate.passwordAuthTag,
        });

        const ufCode = ufToCode(store.uf);

        let cursor = certificate.lastNsuNfe;
        let fetchedTotal = 0;
        let resumoCount = 0;

        for (let batch = 0; batch < MAX_GOODS_SYNC_BATCHES; batch++) {
            const result = await fetchGoodsDistribution(cert, {
                cnpj: store.cnpj,
                ufCode,
                ultNsu: cursor,
                tpAmb: 1,
            });

            if (result.cStat !== '137' && result.cStat !== '138') {
                throw new BadRequestException(
                    `A Sefaz recusou a consulta: ${result.xMotivo || result.cStat}`,
                );
            }

            for (const doc of result.docs) {
                if (!doc.schema.startsWith('resNFe') && !doc.schema.startsWith('procNFe')) {
                    // Eventos (cancelamento, ciência de terceiros etc.) não
                    // interessam pra conciliação de compra ainda — só as
                    // NF-e propriamente ditas.
                    continue;
                }

                const parsedNf = parseResNFe(doc.xml);

                if (!parsedNf?.chaveAcesso) {
                    continue;
                }

                const fileName = `sefaz-${parsedNf.chaveAcesso}.xml`;

                writeFileSync(
                    join(incomingGoodsNfPath, fileName),
                    doc.xml,
                    'utf-8',
                );

                await this.prisma.incomingGoodsNf.upsert({
                    where: {
                        storeId_chaveAcesso: {
                            storeId,
                            chaveAcesso: parsedNf.chaveAcesso,
                        },
                    },
                    update: {
                        nsu: BigInt(doc.nsu || '0'),
                        tipoDocumento: doc.schema,
                        issuerCnpj: parsedNf.issuerCnpj,
                        issuerName: parsedNf.issuerName,
                        value: parsedNf.value,
                        issueDate: parsedNf.issueDate
                            ? new Date(parsedNf.issueDate)
                            : undefined,
                        situacao: parsedNf.situacao,
                        fileUrl: `/uploads/purchases-nfe/${fileName}`,
                    },
                    create: {
                        storeId,
                        chaveAcesso: parsedNf.chaveAcesso,
                        nsu: BigInt(doc.nsu || '0'),
                        tipoDocumento: doc.schema,
                        issuerCnpj: parsedNf.issuerCnpj,
                        issuerName: parsedNf.issuerName,
                        value: parsedNf.value,
                        issueDate: parsedNf.issueDate
                            ? new Date(parsedNf.issueDate)
                            : undefined,
                        situacao: parsedNf.situacao,
                        fileUrl: `/uploads/purchases-nfe/${fileName}`,
                    },
                });

                fetchedTotal += 1;
                resumoCount += 1;
            }

            const maxNsu = BigInt(result.maxNSU || '0');
            const respUltNsu = BigInt(result.ultNSU || '0');

            cursor = respUltNsu;

            if (result.cStat === '137' || respUltNsu >= maxNsu) {
                break;
            }
        }

        await this.prisma.storeCertificate.update({
            where: { storeId },
            data: { lastNsuNfe: cursor },
        });

        return { fetchedTotal, resumoCount };
    }

    async findIncomingGoodsNf(user: any, filters?: { storeId?: string }) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const items = await this.prisma.incomingGoodsNf.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                purchaseId: null,
                ignored: false,
            },
            orderBy: {
                issueDate: 'desc',
            },
        });

        // BigInt não serializa em JSON por padrão.
        return items.map((item) => ({
            ...item,
            nsu: item.nsu.toString(),
        }));
    }

    // Vincula uma NF de mercadoria baixada automaticamente a uma compra já
    // cadastrada — mesmo princípio da conciliação de NF de Serviço. Reusa
    // addFiscalDocument pra manter o mesmo comportamento de status/histórico
    // de quando a NF é anexada manualmente.
    async linkIncomingGoodsNf(
        incomingNfId: string,
        purchaseId: string,
        user: any,
    ) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        const purchase = await this.ensurePurchaseAccess(purchaseId, user);

        if (purchase.storeId !== incoming.storeId) {
            throw new BadRequestException(
                'A compra selecionada é de outra loja.',
            );
        }

        await this.addFiscalDocument(
            purchaseId,
            {
                type: FiscalDocumentType.INVOICE,
                accessKey: incoming.chaveAcesso,
                fileUrl: incoming.fileUrl || undefined,
                value: incoming.value ? Number(incoming.value) : undefined,
            },
            user,
        );

        return this.prisma.incomingGoodsNf.update({
            where: { id: incomingNfId },
            data: { purchaseId },
        });
    }

    // "Não é nossa" — some da lista de pendências sem apagar o registro
    // (fica guardado caso precise investigar depois).
    async ignoreIncomingGoodsNf(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        return this.prisma.incomingGoodsNf.update({
            where: { id: incomingNfId },
            data: { ignored: true },
        });
    }
}