import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    BillStatus,
    ExternalLaunchStatus,
    PurchaseHistoryAction,
    PurchaseStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { parseOfx } from './ofx-parser';

@Injectable()
export class BillsService {
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

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) {
            return;
        }

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException(
                'Você não tem acesso a esta loja.',
            );
        }
    }

    private canManageBills(user: any) {
        return [
            UserRole.ADMINISTRATIVO,
            UserRole.PROPRIETARIO,
            UserRole.GERENTE,
            UserRole.FINANCEIRO,
        ].includes(user.role);
    }

    private async ensureBillAccess(id: string, user: any) {
        const bill = await this.prisma.bill.findUnique({
            where: { id },
            select: {
                id: true,
                storeId: true,
                purchaseId: true,
                status: true,
                notes: true,
            },
        });

        if (!bill) {
            throw new NotFoundException(
                'Conta a pagar não encontrada.',
            );
        }

        this.ensureStoreAccess(bill.storeId, user);

        return bill;
    }

    async create(dto: CreateBillDto, user: any) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para cadastrar contas a pagar.',
            );
        }

        this.ensureStoreAccess(dto.storeId, user);

        if (dto.purchaseId) {
            const purchase =
                await this.prisma.purchase.findUnique({
                    where: {
                        id: dto.purchaseId,
                    },
                    select: {
                        id: true,
                        storeId: true,
                        supplierId: true,
                    },
                });

            if (!purchase) {
                throw new NotFoundException(
                    'Compra vinculada não encontrada.',
                );
            }

            if (purchase.storeId !== dto.storeId) {
                throw new BadRequestException(
                    'A conta e a compra precisam pertencer à mesma loja.',
                );
            }
        }

        const bill = await this.prisma.bill.create({
            data: {
                description: dto.description,
                value: dto.value,
                type: dto.type,
                paymentMethod: dto.paymentMethod,

                dueDate: new Date(
                    `${dto.dueDate}T12:00:00.000Z`,
                ),

                status: BillStatus.OPEN,

                externalLaunchStatus:
                    dto.externalLaunchStatus ||
                    ExternalLaunchStatus.NOT_LAUNCHED,

                externalSystemName: dto.externalSystemName,
                externalCode: dto.externalCode,

                hasBillFile:
                    dto.hasBillFile || Boolean(dto.fileUrl),

                barcode: dto.barcode,

                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
                pixQrCode: dto.pixQrCode,

                bankName: dto.bankName,
                bankAgency: dto.bankAgency,
                bankAccount: dto.bankAccount,
                beneficiary: dto.beneficiary,

                storeId: dto.storeId,
                purchaseId: dto.purchaseId,
                supplierId: dto.supplierId,
                launchedById: user.id,

                fileUrl: dto.fileUrl,
                imageUrl: dto.imageUrl,
                paymentProofUrl: dto.paymentProofUrl,

                notes: dto.notes,
            },

            include: this.defaultInclude(),
        });

        if (bill.purchaseId) {
            await this.prisma.purchaseHistory.create({
                data: {
                    purchaseId: bill.purchaseId,
                    userId: user.id,
                    action:
                        PurchaseHistoryAction.BILL_CREATED,
                    comment: `Conta a pagar criada no valor de ${Number(
                        bill.value,
                    ).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                    })}.`,
                },
            });
        }

        return bill;
    }

    async findAll(
        user: any,
        filters?: {
            status?: BillStatus;
            storeId?: string;
            purchaseId?: string;
            supplierId?: string;
            startDate?: string;
            endDate?: string;
        },
    ) {
        const allowedStoreIds =
            this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.bill.findMany({
            where: {
                status: filters?.status,
                purchaseId: filters?.purchaseId,
                supplierId: filters?.supplierId,
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds
                        ? {
                            in: allowedStoreIds,
                        }
                        : undefined),
                dueDate: {
                    gte: filters?.startDate
                        ? new Date(
                            `${filters.startDate}T00:00:00.000Z`,
                        )
                        : undefined,
                    lte: filters?.endDate
                        ? new Date(
                            `${filters.endDate}T23:59:59.999Z`,
                        )
                        : undefined,
                },
            },
            orderBy: [
                {
                    dueDate: 'asc',
                },
                {
                    createdAt: 'desc',
                },
            ],
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        await this.ensureBillAccess(id, user);

        return this.prisma.bill.findUnique({
            where: { id },
            include: this.defaultInclude(),
        });
    }

    async update(
        id: string,
        dto: UpdateBillDto,
        user: any,
    ) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para editar contas a pagar.',
            );
        }

        const currentBill = await this.ensureBillAccess(
            id,
            user,
        );

        if (dto.storeId) {
            this.ensureStoreAccess(dto.storeId, user);
        }

        const bill = await this.prisma.bill.update({
            where: { id },

            data: {
                description: dto.description,
                value: dto.value,
                type: dto.type,
                paymentMethod: dto.paymentMethod,

                dueDate: dto.dueDate
                    ? new Date(
                        `${dto.dueDate}T12:00:00.000Z`,
                    )
                    : undefined,

                paidAt: dto.paidAt
                    ? new Date(dto.paidAt)
                    : undefined,

                status: dto.status,

                externalLaunchStatus:
                    dto.externalLaunchStatus,

                externalSystemName:
                    dto.externalSystemName,

                externalCode:
                    dto.externalCode,

                hasBillFile:
                    dto.hasBillFile,

                barcode:
                    dto.barcode,

                pixKey:
                    dto.pixKey,

                pixKeyType:
                    dto.pixKeyType,

                pixQrCode:
                    dto.pixQrCode,

                bankName:
                    dto.bankName,

                bankAgency:
                    dto.bankAgency,

                bankAccount:
                    dto.bankAccount,

                beneficiary:
                    dto.beneficiary,

                storeId:
                    dto.storeId,

                purchaseId:
                    dto.purchaseId,

                supplierId:
                    dto.supplierId,

                fileUrl:
                    dto.fileUrl,

                imageUrl:
                    dto.imageUrl,

                paymentProofUrl:
                    dto.paymentProofUrl,

                notes:
                    dto.notes,
            },

            include: this.defaultInclude(),
        });

        if (
            currentBill.purchaseId &&
            dto.status === BillStatus.PAID
        ) {
            await this.prisma.purchaseHistory.create({
                data: {
                    purchaseId:
                        currentBill.purchaseId,
                    userId: user.id,
                    action:
                        PurchaseHistoryAction.BILL_PAID,
                    comment: `Conta paga no valor de ${Number(
                        bill.value,
                    ).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                    })}.`,
                },
            });
        }

        return bill;
    }

    async markAsPaid(
        id: string,
        user: any,
        paidAt?: string,
        reconciliationNote?: string,
    ) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para marcar contas como pagas.',
            );
        }

        const currentBill = await this.ensureBillAccess(
            id,
            user,
        );

        if (currentBill.status === BillStatus.PAID) {
            throw new BadRequestException(
                'Essa conta já está paga.',
            );
        }

        const bill = await this.prisma.bill.update({
            where: { id },
            data: {
                status: BillStatus.PAID,
                paidAt: paidAt
                    ? new Date(paidAt)
                    : new Date(),
                notes: reconciliationNote
                    ? [currentBill.notes, reconciliationNote]
                        .filter(Boolean)
                        .join('\n')
                    : undefined,
            },
            include: this.defaultInclude(),
        });

        if (bill.purchaseId) {
            await this.prisma.purchaseHistory.create({
                data: {
                    purchaseId: bill.purchaseId,
                    userId: user.id,
                    action:
                        PurchaseHistoryAction.BILL_PAID,
                    comment: `Conta marcada como paga no valor de ${Number(
                        bill.value,
                    ).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                    })}.`,
                },
            });

            const openBills =
                await this.prisma.bill.count({
                    where: {
                        purchaseId: bill.purchaseId,
                        status: {
                            in: [
                                BillStatus.OPEN,
                                BillStatus.OVERDUE,
                            ],
                        },
                    },
                });

            if (openBills === 0) {
                await this.prisma.purchase.update({
                    where: {
                        id: bill.purchaseId,
                    },
                    data: {
                        status: PurchaseStatus.CLOSED,
                        closedById: user.id,
                        closedAt: new Date(),
                    },
                });

                await this.prisma.purchaseHistory.create({
                    data: {
                        purchaseId: bill.purchaseId,
                        userId: user.id,
                        action:
                            PurchaseHistoryAction.CLOSED,
                        comment:
                            'Compra encerrada após o pagamento de todas as contas.',
                    },
                });
            }
        }

        return bill;
    }

    async markAsLaunched(
        id: string,
        user: any,
        data?: {
            externalSystemName?: string;
            externalCode?: string;
        },
    ) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para informar lançamento externo.',
            );
        }

        await this.ensureBillAccess(id, user);

        return this.prisma.bill.update({
            where: { id },
            data: {
                externalLaunchStatus:
                    ExternalLaunchStatus.LAUNCHED,
                externalSystemName:
                    data?.externalSystemName || 'OMIE',
                externalCode: data?.externalCode,
            },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        if (
            ![
                UserRole.ADMINISTRATIVO,
                UserRole.PROPRIETARIO,
            ].includes(user.role)
        ) {
            throw new ForbiddenException(
                'A exclusão definitiva depende de um administrador ou proprietário.',
            );
        }

        await this.ensureBillAccess(id, user);

        return this.prisma.bill.update({
            where: { id },
            data: {
                status: BillStatus.CANCELED,
            },
            include: this.defaultInclude(),
        });
    }

    parseOfxStatement(content: string) {
        const transactions = parseOfx(content);

        if (transactions.length === 0) {
            throw new BadRequestException(
                'Não encontramos movimentações nesse arquivo. Confira se é um extrato OFX válido.',
            );
        }

        return { transactions };
    }

    private defaultInclude() {
        return {
            store: true,
            supplier: true,
            purchase: {
                include: {
                    store: true,
                    supplier: true,
                },
            },
            launchedBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        };
    }
}