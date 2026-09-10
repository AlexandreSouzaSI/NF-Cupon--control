import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { PrismaService } from 'prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { BillsService } from '../bills/bills.service';
import { BillCategoriesService } from '../bill-categories/bill-categories.service';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { AcceptIncomingNfDto } from './dto/accept-incoming-nf.dto';
import { loadCertificate, type LoadedCertificate } from '../stores/sefaz-nfse-client';
import {
    fetchGoodsDistribution,
    parseFullNfeForView,
    parseFullNfeXml,
    parseResNFe,
    sendManifestacao,
    ufToCode,
    type NfeView,
} from '../stores/sefaz-nfe-client';
import { sleep } from '../common/sleep.util';
import { derivePaymentDefaults } from '../common/bill-payment-defaults.util';

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

// A doc oficial do webservice (NFeDistribuicaoDFe) recomenda pelo menos 2s
// entre consultas dentro do mesmo loop, pra não estourar o limite de 20
// consultas/hora que a Sefaz aplica por certificado.
const GOODS_SYNC_DELAY_MS = 2000;

// Quantas NFs de resumo (já existentes, sem manifestação) recebem Ciência
// da Operação por rodada de sync — limita o tempo/chamadas extras numa
// execução só; o restante do backlog é resolvido nas rodadas seguintes
// (automáticas a cada 10 min).
const MAX_MANIFEST_BACKFILL_PER_SYNC = 10;

// Depois de "nada de novo" (cStat 137) ou de um bloqueio por consumo
// indevido (cStat 656), a Sefaz só libera consulta de novo depois de 1h —
// e reinicia essa contagem se a gente insistir antes da hora passar.
const SEFAZ_COOLDOWN_MS = 60 * 60 * 1000;

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
        private suppliersService: SuppliersService,
        private billsService: BillsService,
        private billCategoriesService: BillCategoriesService,
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

    // Espelho do pedido: foto/PDF do que foi combinado com o fornecedor,
    // anexado no cadastro ou depois — só documentação de apoio, não muda
    // status nem participa da conferência de itens no recebimento.
    async attachOrderMirror(
        purchaseId: string,
        attachment: { url: string; name: string },
        user: any,
    ) {
        await this.ensurePurchaseAccess(purchaseId, user);

        const purchase = await this.prisma.purchase.update({
            where: { id: purchaseId },
            data: {
                orderMirrorUrl: attachment.url,
                orderMirrorName: attachment.name,
            },
            include: this.defaultInclude(),
        });

        await this.createHistory(
            purchaseId,
            user.id,
            PurchaseHistoryAction.UPDATED,
            'Espelho do pedido anexado.',
        );

        return purchase;
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

        return this.runGoodsSync(storeId);
    }

    // Repara IncomingGoodsNf com chaveAcesso corrompida pelo bug de notação
    // científica (fast-xml-parser convertendo o texto de 44 dígitos do
    // chNFe pra JS number antes da correção do parser em
    // sefaz-nfe-client.ts). O valor já gravado no banco não dá pra
    // recuperar (perdeu precisão), mas o XML original salvo em disco não
    // foi tocado — relê ele com regex (sem passar pelo parser) pra achar a
    // chave certa. Depois de corrigir, zera manifestedAt pra a rotina de
    // backfill (logo abaixo) mandar a Ciência da Operação de novo — a
    // tentativa anterior, com a chave errada, com certeza falhou.
    private async repairCorruptedChaves(storeId: string) {
        const suspects = await this.prisma.incomingGoodsNf.findMany({
            where: {
                storeId,
                tipoDocumento: { startsWith: 'resNFe' },
                fileUrl: { not: null },
            },
        });

        for (const suspect of suspects) {
            if (/^\d{44}$/.test(suspect.chaveAcesso)) {
                continue;
            }

            const relativePath = suspect.fileUrl!.replace(/^\/uploads\//, '');
            const filePath = join(process.cwd(), 'uploads', relativePath);

            if (!existsSync(filePath)) {
                continue;
            }

            let xml: string;

            try {
                xml = readFileSync(filePath, 'utf-8');
            } catch {
                continue;
            }

            const match = xml.match(/<chNFe>(\d{44})<\/chNFe>/);

            if (!match) {
                continue;
            }

            const correctChave = match[1];

            if (correctChave === suspect.chaveAcesso) {
                continue;
            }

            const clash = await this.prisma.incomingGoodsNf.findUnique({
                where: {
                    storeId_chaveAcesso: { storeId, chaveAcesso: correctChave },
                },
            });

            if (clash) {
                // Já existe um registro certo com essa chave (ex: veio de
                // novo numa sync anterior) — só marca o duplicado corrompido
                // como ignorado em vez de tentar mesclar os dois.
                await this.prisma.incomingGoodsNf.update({
                    where: { id: suspect.id },
                    data: {
                        ignored: true,
                        manifestStatus:
                            'Registro duplicado com chave corrompida (bug de notação científica) — já existe outro com a chave certa.',
                    },
                });
                continue;
            }

            await this.prisma.incomingGoodsNf.update({
                where: { id: suspect.id },
                data: {
                    chaveAcesso: correctChave,
                    manifestedAt: null,
                    manifestStatus:
                        'Chave de acesso corrigida (bug de notação científica no parser) — manifestação será refeita.',
                },
            });
        }
    }

    // Núcleo da busca de NF-e de mercadoria, sem checagem de usuário — usado
    // tanto pelo clique manual (syncIncomingGoodsNf acima, já validou acesso)
    // quanto pelo job automático (autoSyncGoodsNf abaixo, que roda pro
    // sistema inteiro sem um usuário logado).
    private async runGoodsSync(storeId: string) {
        // Roda ANTES de qualquer checagem/consulta na Sefaz de propósito —
        // é uma operação 100% local (banco + XML já salvo em disco), sem
        // chamada nenhuma pra Sefaz. Se isso ficasse depois do bloqueio de
        // cooldown (nfeBlockedUntil), nunca rodaria enquanto a loja
        // estivesse em cooldown — e como todo sync bem-sucedido já termina
        // ligando esse cooldown por 1h, na prática o reparo quase nunca
        // seria alcançado.
        await this.repairCorruptedChaves(storeId);

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

        // A Sefaz pune insistência: se a última rodada terminou em "nada de
        // novo" (137) ou em bloqueio por consumo indevido (656), só vale a
        // pena tentar de novo depois de 1h — tentar antes reinicia a
        // contagem do bloqueio (documentado pela própria Sefaz e reforçado
        // pela Omie, que também consulta esse mesmo CNPJ pelo contador).
        if (certificate.nfeBlockedUntil && certificate.nfeBlockedUntil > new Date()) {
            throw new BadRequestException(
                `A Sefaz pediu espera depois da última consulta. Tente de novo às ${certificate.nfeBlockedUntil.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`,
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
                // Qualquer status fora desses dois é rejeição/bloqueio (ex:
                // 656 = consumo indevido) — guarda o cooldown antes de
                // avisar, pra não deixar a próxima tentativa reiniciar o
                // bloqueio.
                await this.prisma.storeCertificate.update({
                    where: { storeId },
                    data: {
                        lastNsuNfe: cursor,
                        nfeBlockedUntil: new Date(Date.now() + SEFAZ_COOLDOWN_MS),
                    },
                });

                throw new BadRequestException(
                    result.cStat === '656'
                        ? 'A Sefaz bloqueou temporariamente por excesso de consultas (consumo indevido) — provavelmente porque outro sistema (ex: Omie do contador) também consulta esse CNPJ. Só dá pra tentar de novo daqui a 1h.'
                        : `A Sefaz recusou a consulta: ${result.xMotivo || result.cStat}`,
                );
            }

            for (const doc of result.docs) {
                if (!doc.schema.startsWith('resNFe') && !doc.schema.startsWith('procNFe')) {
                    // Eventos (cancelamento, ciência de terceiros etc.) não
                    // interessam pra conciliação de compra ainda — só as
                    // NF-e propriamente ditas.
                    continue;
                }

                // resNFe (resumo) e procNFe (XML completo) têm raízes XML
                // diferentes — resNFe/resEvento vs. infNFe — então usam
                // parsers diferentes. Antes disso aqui sempre chamava
                // parseResNFe pra tudo: quando a Sefaz finalmente entregava
                // o procNFe completo (depois da manifestação), parseResNFe
                // não reconhecia a raiz, devolvia null, e o "continue"
                // acima descartava o XML completo em silêncio — o registro
                // nunca saía de "resNFe" e o arquivo nunca era salvo. Único
                // jeito de notar era abrir a NF e só existir o resumo.
                const parsedNf = doc.schema.startsWith('procNFe')
                    ? parseFullNfeXml(doc.xml)
                    : parseResNFe(doc.xml);

                if (!parsedNf?.chaveAcesso) {
                    continue;
                }

                const fileName = `sefaz-${parsedNf.chaveAcesso}.xml`;

                writeFileSync(
                    join(incomingGoodsNfPath, fileName),
                    doc.xml,
                    'utf-8',
                );

                const incomingRecord = await this.prisma.incomingGoodsNf.upsert({
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

                // Só veio o resumo (resNFe) — dispara a Ciência da Operação
                // automaticamente pra Sefaz liberar o XML completo (com
                // itens) numa próxima consulta. procNFe já é o XML
                // completo, não precisa manifestar de novo. Se já
                // manifestou antes (manifestedAt preenchido) não repete.
                if (
                    doc.schema.startsWith('resNFe') &&
                    !incomingRecord.manifestedAt
                ) {
                    await this.manifestIfNeeded(
                        incomingRecord.id,
                        parsedNf.chaveAcesso,
                        cert,
                        store.uf,
                        store.cnpj,
                    );
                }
            }

            const maxNsu = BigInt(result.maxNSU || '0');
            const respUltNsu = BigInt(result.ultNSU || '0');

            cursor = respUltNsu;

            // Salva o progresso a cada lote (não só no final) — se a Sefaz
            // bloquear no meio de uma rodada grande, o que já avançou não
            // se perde, e a próxima tentativa não reconsulta NSU repetido.
            await this.prisma.storeCertificate.update({
                where: { storeId },
                data: { lastNsuNfe: cursor },
            });

            if (result.cStat === '137' || respUltNsu >= maxNsu) {
                // Chegou ao fim do que existe pra consultar agora — a Sefaz
                // só libera consulta de novo depois de 1h (consultar antes
                // conta como "consumo indevido").
                await this.prisma.storeCertificate.update({
                    where: { storeId },
                    data: { nfeBlockedUntil: new Date(Date.now() + SEFAZ_COOLDOWN_MS) },
                });
                break;
            }

            // Ainda tem mais lote pela frente — espera um pouco antes da
            // próxima consulta pra não martelar o webservice da Sefaz.
            await sleep(GOODS_SYNC_DELAY_MS);
        }

        // Backfill: NFs de resumo que já existiam antes desse recurso (ou
        // cuja manifestação anterior falhou) também precisam de Ciência da
        // Operação — a distribuição da Sefaz só devolve documentos NOVOS
        // desde o último NSU, então uma NF já capturada em rodadas
        // passadas nunca mais reaparece em `result.docs` e, sem esse
        // passo, ficaria pra sempre sem manifestação. Limitado por rodada
        // pra não estourar tempo/limite de chamadas numa sync só — o que
        // sobrar pega na próxima rodada (automática a cada 10 min).
        const pendingManifest = await this.prisma.incomingGoodsNf.findMany({
            where: {
                storeId,
                tipoDocumento: { startsWith: 'resNFe' },
                manifestedAt: null,
            },
            take: MAX_MANIFEST_BACKFILL_PER_SYNC,
        });

        for (const pending of pendingManifest) {
            await this.manifestIfNeeded(
                pending.id,
                pending.chaveAcesso,
                cert,
                store.uf,
                store.cnpj,
            );
        }

        return { fetchedTotal, resumoCount };
    }

    // Envia a Ciência da Operação pra uma NF de entrada específica e grava
    // o resultado (sucesso ou motivo do erro) no próprio registro. Nunca
    // lança exceção — erro aqui não pode derrubar o sync de NFs em si, só
    // fica registrado em manifestStatus pra diagnóstico.
    private async manifestIfNeeded(
        incomingId: string,
        chaveAcesso: string,
        cert: LoadedCertificate,
        uf: string,
        cnpj: string,
    ) {
        try {
            const manifestResult = await sendManifestacao(cert, {
                uf,
                cnpj,
                chaveAcesso,
            });

            await this.prisma.incomingGoodsNf.update({
                where: { id: incomingId },
                data: {
                    manifestedAt: manifestResult.success ? new Date() : undefined,
                    manifestStatus: manifestResult.message,
                },
            });
        } catch (error: any) {
            await this.prisma.incomingGoodsNf.update({
                where: { id: incomingId },
                data: {
                    manifestStatus: `Erro inesperado ao manifestar: ${error?.message || error}`,
                },
            });
        }

        // Mesmo respiro usado entre lotes da distribuição — evita martelar
        // o webservice de eventos quando várias NFs precisam manifestar na
        // mesma rodada.
        await sleep(GOODS_SYNC_DELAY_MS);
    }

    // Roda sozinho a cada 10 minutos e tenta buscar NF-e de mercadoria pra
    // toda loja com certificado que não esteja em cooldown no momento (ver
    // nfeBlockedUntil). Como o cooldown dura 1h depois de qualquer tentativa
    // (com ou sem nota nova), na prática isso converge pra ~1 tentativa por
    // loja por hora — dentro do limite da Sefaz — mas sem precisar de
    // ninguém clicando "Buscar" no horário certo. Todo resultado (sucesso ou
    // erro) fica registrado em SefazSyncLog pra dar visibilidade.
    @Cron(CronExpression.EVERY_10_MINUTES)
    async autoSyncGoodsNf() {
        const now = new Date();

        const certificates = await this.prisma.storeCertificate.findMany({
            where: {
                OR: [{ nfeBlockedUntil: null }, { nfeBlockedUntil: { lte: now } }],
            },
        });

        for (const certificate of certificates) {
            try {
                const result = await this.runGoodsSync(certificate.storeId);

                await this.logSefazSync(
                    certificate.storeId,
                    'NFE_COMPRA',
                    true,
                    result.fetchedTotal > 0
                        ? `${result.fetchedTotal} NF-e nova(s) encontrada(s).`
                        : 'Busca automática rodou, nenhuma NF-e nova.',
                    result.fetchedTotal,
                );
            } catch (error: any) {
                await this.logSefazSync(
                    certificate.storeId,
                    'NFE_COMPRA',
                    false,
                    String(error?.message || error),
                    0,
                );
            }
        }
    }

    private async logSefazSync(
        storeId: string,
        source: 'NFE_COMPRA' | 'NFSE_SERVICO',
        success: boolean,
        message: string,
        fetchedTotal: number,
    ) {
        try {
            await this.prisma.sefazSyncLog.create({
                data: { storeId, source, success, message, fetchedTotal },
            });
        } catch {
            // O log é só auxiliar — nunca deve derrubar a sincronização.
        }
    }

    // Fallback pra quando a busca automática na Sefaz não funciona (ou pra
    // recuperar NFs antigas, de antes do certificado cadastrado): a pessoa
    // exporta os XMLs completos de onde tiver (fornecedor, contabilidade
    // etc.) e sobe aqui de uma vez. Cada arquivo só é aceito se a loja
    // ativa for a destinatária da nota — do contrário não é uma compra
    // dela.
    async importGoodsNfXml(
        storeId: string,
        files: Express.Multer.File[],
        user: any,
    ) {
        if (!storeId) {
            throw new BadRequestException(
                'Selecione uma loja ativa no topo do sistema.',
            );
        }

        this.ensureStoreAccess(storeId, user);

        if (!files || files.length === 0) {
            throw new BadRequestException('Envie pelo menos um arquivo XML.');
        }

        const store = await this.prisma.store.findUnique({
            where: { id: storeId },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada.');
        }

        const storeCnpjDigits = (store.cnpj || '').replace(/\D/g, '');

        let imported = 0;
        const errors: { fileName: string; reason: string }[] = [];

        for (const file of files) {
            const xml = file.buffer.toString('utf-8');
            const parsedNf = parseFullNfeXml(xml);

            if (!parsedNf) {
                errors.push({
                    fileName: file.originalname,
                    reason: 'Arquivo não é um XML de NF-e válido.',
                });
                continue;
            }

            const recipientCnpjDigits = (parsedNf.recipientCnpj || '').replace(
                /\D/g,
                '',
            );

            if (
                storeCnpjDigits &&
                recipientCnpjDigits &&
                recipientCnpjDigits !== storeCnpjDigits
            ) {
                errors.push({
                    fileName: file.originalname,
                    reason:
                        'O CNPJ destinatário dessa NF não é o CNPJ da loja ativa.',
                });
                continue;
            }

            const fileName = `upload-${parsedNf.chaveAcesso}.xml`;

            writeFileSync(join(incomingGoodsNfPath, fileName), xml, 'utf-8');

            await this.prisma.incomingGoodsNf.upsert({
                where: {
                    storeId_chaveAcesso: {
                        storeId,
                        chaveAcesso: parsedNf.chaveAcesso,
                    },
                },
                update: {
                    tipoDocumento: `mod${parsedNf.tipoDocumento || ''}`,
                    issuerCnpj: parsedNf.issuerCnpj,
                    issuerName: parsedNf.issuerName,
                    value: parsedNf.value,
                    issueDate: parsedNf.issueDate
                        ? new Date(parsedNf.issueDate)
                        : undefined,
                    situacao: parsedNf.situacao,
                    fileUrl: `/uploads/purchases-nfe/${fileName}`,
                    source: 'XML_UPLOAD',
                },
                create: {
                    storeId,
                    chaveAcesso: parsedNf.chaveAcesso,
                    nsu: BigInt(0),
                    tipoDocumento: `mod${parsedNf.tipoDocumento || ''}`,
                    issuerCnpj: parsedNf.issuerCnpj,
                    issuerName: parsedNf.issuerName,
                    value: parsedNf.value,
                    issueDate: parsedNf.issueDate
                        ? new Date(parsedNf.issueDate)
                        : undefined,
                    situacao: parsedNf.situacao,
                    fileUrl: `/uploads/purchases-nfe/${fileName}`,
                    source: 'XML_UPLOAD',
                },
            });

            imported += 1;
        }

        return { imported, errors };
    }

    // accepted=false (padrão): só pendentes (nunca tocadas). accepted=true:
    // "NFs Aceitas" — tudo que já saiu do estado pendente por vincular à
    // compra, aceitar sem conta ou aceitar gerando conta (recusada/ignored
    // fica de fora dos dois, é um terceiro estado que não aparece em
    // nenhuma das abas).
    async findIncomingGoodsNf(
        user: any,
        filters?: {
            storeId?: string;
            page?: number;
            pageSize?: number;
            accepted?: boolean;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const page = filters?.page && filters.page > 0 ? filters.page : 1;
        const pageSize =
            filters?.pageSize && filters.pageSize > 0
                ? filters.pageSize
                : 20;

        const where = filters?.accepted
            ? {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                ignored: false,
                OR: [
                    { purchaseId: { not: null } },
                    { billId: { not: null } },
                    { accepted: true },
                ],
            }
            : {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                purchaseId: null,
                billId: null,
                accepted: false,
                ignored: false,
            };

        const [items, total] = await Promise.all([
            this.prisma.incomingGoodsNf.findMany({
                where,
                // nulls: 'last' pra não jogar as NF sem data de emissão
                // reconhecida pro topo da lista (padrão do Postgres em DESC
                // é nulls primeiro, o que parecia lista fora de ordem).
                orderBy: {
                    issueDate: { sort: 'desc', nulls: 'last' },
                },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.incomingGoodsNf.count({ where }),
        ]);

        // BigInt não serializa em JSON por padrão.
        return {
            items: items.map((item) => ({
                ...item,
                nsu: item.nsu.toString(),
            })),
            total,
            page,
            pageSize,
        };
    }

    // Mesmo cálculo de mês/período usado em várias telas do sistema — mês
    // vira intervalo UTC completo, período usa meio-dia UTC no início pra
    // não recuar um dia por causa do fuso.
    private buildDateFilter(filters?: {
        month?: string;
        startDate?: string;
        endDate?: string;
    }): { gte?: Date; lte?: Date } | undefined {
        if (filters?.month) {
            const [year, month] = filters.month.split('-').map(Number);

            const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
            const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

            return { gte: start, lte: end };
        }

        if (filters?.startDate || filters?.endDate) {
            return {
                gte: filters.startDate
                    ? new Date(`${filters.startDate}T12:00:00.000Z`)
                    : undefined,
                lte: filters.endDate
                    ? new Date(`${filters.endDate}T23:59:59.999Z`)
                    : undefined,
            };
        }

        return undefined;
    }

    // Zip de download por mês/período — inclui TODAS as NF de entrada com
    // arquivo (pendente, vinculada a compra/conta ou aceita), não só as
    // resolvidas. O usuário pediu acesso a todas as NFs a qualquer
    // momento, vinculadas ou não a algo existente — antes esse download só
    // trazia as já resolvidas (purchaseId/billId/accepted), deixando de
    // fora qualquer uma ainda pendente de decisão.
    async findGoodsForDownload(
        user: any,
        filters: {
            storeId?: string;
            month?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const dateFilter = this.buildDateFilter(filters);

        const items = await this.prisma.incomingGoodsNf.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                ignored: false,
                fileUrl: { not: null },
                issueDate: dateFilter,
            },
            orderBy: { issueDate: { sort: 'desc', nulls: 'last' } },
        });

        if (items.length === 0) {
            throw new BadRequestException(
                'Nenhuma NF de entrada encontrada nesse período.',
            );
        }

        return items.map((item) => ({
            fileUrl: item.fileUrl as string,
            date: item.issueDate || item.fetchedAt,
            providerName: item.issuerName || 'Fornecedor não identificado',
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

        const updated = await this.prisma.incomingGoodsNf.update({
            where: { id: incomingNfId },
            data: { purchaseId },
        });

        return { ...updated, nsu: updated.nsu.toString() };
    }

    // "Recusar" (antiga "Não é nossa") — some da lista de pendências sem
    // apagar o registro (fica guardado caso precise investigar depois).
    async ignoreIncomingGoodsNf(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        const updated = await this.prisma.incomingGoodsNf.update({
            where: { id: incomingNfId },
            data: { ignored: true },
        });

        return { ...updated, nsu: updated.nsu.toString() };
    }

    // "Aceitar" — alternativa a vincular numa Compra já cadastrada.
    // generateBill = false: só marca como aceita (some da lista pendente,
    // sem criar nada em Contas a Pagar — útil quando a conta já foi
    // lançada por outro caminho). generateBill = true: cria a Conta a
    // Pagar direto a partir da NF (fornecedor/valor tirados da própria NF,
    // categoria e vencimento informados na hora).
    async acceptIncomingGoodsNf(
        incomingNfId: string,
        dto: AcceptIncomingNfDto,
        user: any,
    ) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        if (!dto.generateBill) {
            const updated = await this.prisma.incomingGoodsNf.update({
                where: { id: incomingNfId },
                data: { accepted: true },
            });

            return { ...updated, nsu: updated.nsu.toString() };
        }

        if (!dto.dueDate) {
            throw new BadRequestException(
                'Informe a data de vencimento da conta.',
            );
        }

        const supplierName = dto.supplierName?.trim() || incoming.issuerName;

        if (!supplierName) {
            throw new BadRequestException(
                'Informe a empresa (fornecedor) da conta.',
            );
        }

        const supplier = await this.suppliersService.findOrCreate(supplierName);

        let categoryId: string | undefined;

        if (dto.categoryName?.trim()) {
            const category = await this.billCategoriesService.findOrCreate(
                dto.categoryName.trim(),
            );
            categoryId = category.id;
        }

        const { type, paymentMethod } = derivePaymentDefaults(dto);

        const bill = await this.billsService.create(
            {
                description: `NF de entrada — ${supplier.name}`,
                value: Number(incoming.value || 0),
                type,
                paymentMethod,
                dueDate: dto.dueDate,
                storeId: incoming.storeId,
                supplierId: supplier.id,
                categoryId,
                barcode: dto.barcode,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
            },
            user,
        );

        const updated = await this.prisma.incomingGoodsNf.update({
            where: { id: incomingNfId },
            data: { billId: bill.id },
        });

        return { ...updated, nsu: updated.nsu.toString() };
    }

    // "Resumo legível" — parseia o XML já salvo em disco na hora (não
    // persiste nada novo) pra devolver um resumo bem mais completo que os
    // campos terços já guardados no banco pra listagem. Se não tiver XML
    // salvo, ou o parse falhar (schema divergente, arquivo corrompido), cai
    // pro resumo com o que já está no banco em vez de dar erro — a NF
    // sincronizada automaticamente às vezes só tem o resumo (resNFe), sem
    // itens (a leitura de "manifestação" com XML completo é fase futura).
    async viewIncomingGoodsNf(incomingNfId: string, user: any) {
        const incoming = await this.prisma.incomingGoodsNf.findUnique({
            where: { id: incomingNfId },
        });

        if (!incoming) {
            throw new NotFoundException('Documento não encontrado.');
        }

        this.ensureStoreAccess(incoming.storeId, user);

        let parsed: NfeView | null = null;

        if (incoming.fileUrl) {
            const relativePath = incoming.fileUrl.replace(/^\/uploads\//, '');
            const filePath = join(process.cwd(), 'uploads', relativePath);

            if (existsSync(filePath)) {
                try {
                    const xml = readFileSync(filePath, 'utf-8');
                    parsed = parseFullNfeForView(xml);
                } catch {
                    parsed = null;
                }
            }
        }

        return {
            source: parsed ? 'xml' : 'resumo',
            resumo: {
                chaveAcesso: incoming.chaveAcesso,
                tipoDocumento: incoming.tipoDocumento,
                issuerName: incoming.issuerName,
                issuerCnpj: incoming.issuerCnpj,
                value: incoming.value ? Number(incoming.value) : undefined,
                issueDate: incoming.issueDate,
                situacao: incoming.situacao,
            },
            nf: parsed,
        };
    }
}