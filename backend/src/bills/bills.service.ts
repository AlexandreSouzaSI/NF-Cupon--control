import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    BillStatus,
    PurchaseHistoryAction,
    PurchaseStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { parseOfx } from './ofx-parser';
import { buildTodayReportPdf } from './bills-report-builder';
import {
    buildCnab240Remessa,
    BoletoPagamento,
    PixPagamento,
} from './cnab240-sicredi-builder';

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

        let noInvoiceProductsNoteToPersist: string | undefined;

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
                        noInvoiceProductsNote: true,
                        fiscalDocuments: {
                            where: {
                                status: 'LINKED',
                            },
                            select: { type: true },
                        },
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

            // Fluxo 2: compra sem NF e sem previsão de ter uma. Se não existe
            // nenhum FiscalDocument (nem INVOICE, nem COUPON/foto da notinha)
            // vinculado, exige descrição dos produtos ou a foto antes de gerar
            // a conta — é o que depois vai permitir vincular ao estoque.
            const hasFiscalDocument = purchase.fiscalDocuments.length > 0;
            const existingNote = purchase.noInvoiceProductsNote?.trim();
            const incomingNote = dto.noInvoiceProductsNote?.trim();

            if (!hasFiscalDocument && !existingNote && !incomingNote) {
                throw new BadRequestException(
                    'Essa compra não tem NF nem cupom anexado. Descreva os produtos comprados ou envie uma foto da notinha antes de gerar a conta a pagar.',
                );
            }

            if (!existingNote && incomingNote) {
                noInvoiceProductsNoteToPersist = incomingNote;
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
                categoryId: dto.categoryId,
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

            if (noInvoiceProductsNoteToPersist) {
                await this.prisma.purchase.update({
                    where: { id: bill.purchaseId },
                    data: {
                        noInvoiceProductsNote:
                            noInvoiceProductsNoteToPersist,
                    },
                });

                await this.prisma.purchaseHistory.create({
                    data: {
                        purchaseId: bill.purchaseId,
                        userId: user.id,
                        action: PurchaseHistoryAction.UPDATED,
                        comment: `Descrição dos produtos (compra sem NF) registrada: "${noInvoiceProductsNoteToPersist}".`,
                    },
                });
            }
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
            page?: number;
            pageSize?: number;
        },
    ) {
        const allowedStoreIds =
            this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const where = {
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
        };

        const orderBy = [
            { dueDate: 'asc' as const },
            { createdAt: 'desc' as const },
        ];

        // Paginado só quando page/pageSize são informados (mesmo padrão
        // usado em Compras/NF de Entrada) — a tela de Contas a Pagar hoje
        // monta os cards de período (Hoje/Vencidas/etc.) a partir da lista
        // inteira do intervalo pedido, então sem paginação continua
        // funcionando como sempre funcionou; quem quiser resultado
        // paginado (listas longas sem filtro de período) passa
        // page/pageSize.
        if (!filters?.page && !filters?.pageSize) {
            return this.prisma.bill.findMany({
                where,
                orderBy,
                include: this.defaultInclude(),
            });
        }

        const page = filters?.page && filters.page > 0 ? filters.page : 1;
        const pageSize =
            filters?.pageSize && filters.pageSize > 0
                ? filters.pageSize
                : 20;

        const [items, total] = await Promise.all([
            this.prisma.bill.findMany({
                where,
                orderBy,
                include: this.defaultInclude(),
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
            this.prisma.bill.count({ where }),
        ]);

        return { items, total, page, pageSize };
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

                queuedForPaymentAt:
                    dto.status === BillStatus.PAID ? null : undefined,

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

                categoryId:
                    dto.categoryId,

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
                queuedForPaymentAt: null,
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

    private startOfToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    private startOfTomorrow() {
        const start = this.startOfToday();
        start.setDate(start.getDate() + 1);
        return start;
    }

    // "Incluir nos pagamentos de hoje" — só pra contas em aberto/vencidas
    // (pagar/cancelada não faz sentido entrar numa fila de pagamento).
    // Alterna: se já estava marcada, desmarca. Não muda dueDate nem status
    // — a conta continua aparecendo como Vencida, só passa a contar
    // também no filtro/relatório de "Hoje".
    async toggleQueueToday(id: string, user: any) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para gerenciar contas a pagar.',
            );
        }

        const currentBill = await this.ensureBillAccess(id, user);

        if (
            currentBill.status !== BillStatus.OPEN &&
            currentBill.status !== BillStatus.OVERDUE
        ) {
            throw new BadRequestException(
                'Só é possível incluir contas em aberto ou vencidas nos pagamentos de hoje.',
            );
        }

        const bill = await this.prisma.bill.findUnique({
            where: { id },
            select: { queuedForPaymentAt: true },
        });

        return this.prisma.bill.update({
            where: { id },
            data: {
                queuedForPaymentAt: bill?.queuedForPaymentAt
                    ? null
                    : new Date(),
            },
            include: this.defaultInclude(),
        });
    }

    // "Colocar todas as vencidas em pagamentos de hoje" — mesma regra do
    // botão individual (toggleQueueToday), só que em massa: pega toda
    // conta OPEN com dueDate no passado e ainda não marcada, e marca de
    // uma vez. Não mexe em quem já estava marcada (fica como estava) nem
    // em conta paga/cancelada. "Vencida" aqui é sempre calculado pela
    // dueDate (não existe um cron que grava status=OVERDUE no banco — o
    // enum existe mas hoje bill.status só vira OPEN/PAID/CANCELED).
    async queueAllOverdueToday(user: any, storeId?: string) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para gerenciar contas a pagar.',
            );
        }

        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        const allowedStoreIds = this.getAllowedStoreIds(user);

        const vencidas = await this.prisma.bill.findMany({
            where: {
                status: BillStatus.OPEN,
                queuedForPaymentAt: null,
                dueDate: { lt: this.startOfToday() },
                storeId:
                    storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
            },
            select: { id: true },
        });

        if (vencidas.length === 0) {
            return { total: 0, ids: [] };
        }

        const ids = vencidas.map((bill) => bill.id);

        await this.prisma.bill.updateMany({
            where: { id: { in: ids } },
            data: { queuedForPaymentAt: new Date() },
        });

        return { total: ids.length, ids };
    }

    // Lista usada no relatório do dia: contas com vencimento hoje +
    // vencidas que alguém marcou manualmente pra entrar nos pagamentos de
    // hoje (toggleQueueToday) — mesmo critério do filtro "Hoje" da tela.
    async findTodayBills(user: any, storeId?: string) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (storeId) {
            this.ensureStoreAccess(storeId, user);
        }

        const start = this.startOfToday();
        const end = this.startOfTomorrow();

        const bills = await this.prisma.bill.findMany({
            where: {
                status: { in: [BillStatus.OPEN, BillStatus.OVERDUE] },
                storeId:
                    storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                OR: [
                    { dueDate: { gte: start, lt: end } },
                    { queuedForPaymentAt: { not: null } },
                ],
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
            // Só o necessário pro relatório do dia — não o include pesado
            // de defaultInclude() (que inclui compra/categoria/launchedBy).
            include: { store: true, supplier: true },
        });

        // A query já trouxe "vence hoje" OU "marcada pra hoje" — mas uma
        // marcada pra hoje pode ter vencimento em qualquer dia passado, e
        // uma vencida sem marcação não deveria entrar mesmo se veio na
        // OR (não deveria vir, mas o filtro dupla-checa por segurança).
        return bills.filter((bill) => {
            const dueDate = bill.dueDate;
            const isToday = dueDate >= start && dueDate < end;
            const isOverdue = dueDate < start;

            if (isToday) return true;
            if (isOverdue) return Boolean(bill.queuedForPaymentAt);

            return false;
        });
    }

    async getTodayReportPdf(user: any, storeId?: string) {
        const bills = await this.findTodayBills(user, storeId);

        let storeName = 'Todas as lojas';

        if (storeId) {
            const store = await this.prisma.store.findUnique({
                where: { id: storeId },
                select: { name: true },
            });

            storeName = store?.name || storeName;
        }

        return buildTodayReportPdf(
            bills.map((bill) => ({
                id: bill.id,
                description: bill.description,
                value: Number(bill.value),
                dueDate: bill.dueDate,
                status:
                    bill.dueDate < this.startOfToday()
                        ? 'OVERDUE'
                        : 'OPEN',
                supplierName: bill.supplier?.name || null,
                storeName: bill.store.name,
            })),
            { storeName, today: new Date() },
        );
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

    // Só Proprietário/Administrativo mexem no convênio bancário — é dado
    // sensível (identifica a conta da empresa no Sicredi) e usado por
    // todas as lojas ao mesmo tempo (convênio único, não é por loja).
    private canManagePaymentBatch(user: any) {
        return [UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO].includes(
            user.role,
        );
    }

    async getPaymentBatchConfig(user: any) {
        if (!this.canManagePaymentBatch(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para ver a configuração de pagamento em lote.',
            );
        }

        return this.prisma.paymentBatchConfig.findFirst({
            orderBy: { updatedAt: 'desc' },
        });
    }

    async savePaymentBatchConfig(
        user: any,
        body: {
            convenioCode: string;
            agencia: string;
            agenciaDv?: string;
            conta: string;
            contaDv?: string;
            companyName: string;
            companyCnpj: string;
        },
    ) {
        if (!this.canManagePaymentBatch(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para alterar a configuração de pagamento em lote.',
            );
        }

        if (
            !body.convenioCode ||
            !body.agencia ||
            !body.conta ||
            !body.companyName ||
            !body.companyCnpj
        ) {
            throw new BadRequestException(
                'Preencha código do convênio, agência, conta, nome da empresa e CNPJ.',
            );
        }

        // Único registro pra empresa toda — se já existe, atualiza; se não,
        // cria. Evita ficar acumulando linha velha a cada edição.
        const existing = await this.prisma.paymentBatchConfig.findFirst({
            orderBy: { updatedAt: 'desc' },
        });

        const data = {
            convenioCode: body.convenioCode,
            agencia: body.agencia,
            agenciaDv: body.agenciaDv || null,
            conta: body.conta,
            contaDv: body.contaDv || null,
            companyName: body.companyName,
            companyCnpj: body.companyCnpj,
            updatedById: user.id || user.userId,
        };

        if (existing) {
            return this.prisma.paymentBatchConfig.update({
                where: { id: existing.id },
                data,
            });
        }

        return this.prisma.paymentBatchConfig.create({ data });
    }

    // Monta o arquivo CNAB 240 de remessa com as contas marcadas pra
    // "pagamentos de hoje" (mesmo critério de findTodayBills/relatório do
    // dia) — em todas as lojas que o usuário tem acesso, porque o
    // convênio é único pra empresa toda (não dá pra gerar 1 arquivo por
    // loja separado). Só entram boleto (tem código de barras) e PIX (tem
    // chave) — são as 2 formas que o usuário pediu; qualquer outra forma
    // de pagamento (cartão, dinheiro, etc.) fica de fora do arquivo e
    // aparece em "ignoradas" pro usuário saber que precisa pagar por
    // fora.
    async generateBatchPaymentFile(user: any) {
        if (!this.canManagePaymentBatch(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para gerar o lançamento em lote.',
            );
        }

        const convenio = await this.prisma.paymentBatchConfig.findFirst({
            orderBy: { updatedAt: 'desc' },
        });

        if (!convenio) {
            throw new BadRequestException(
                'Configure o convênio do Sicredi antes de gerar o arquivo (Contas a Pagar → Lançamento em lote).',
            );
        }

        const bills = await this.findTodayBills(user);

        const pendentes = bills.filter(
            (bill) => bill.paymentMethod === 'BANK_SLIP' || bill.paymentMethod === 'PIX',
        );

        const boletos: BoletoPagamento[] = [];
        const pixPagamentos: PixPagamento[] = [];
        const ignoradas: { id: string; description: string; motivo: string }[] =
            [];

        const hoje = new Date();

        for (const bill of bills) {
            if (bill.paymentMethod === 'BANK_SLIP') {
                if (!bill.barcode) {
                    ignoradas.push({
                        id: bill.id,
                        description: bill.description,
                        motivo: 'Boleto sem código de barras cadastrado.',
                    });
                    continue;
                }

                boletos.push({
                    billId: bill.id,
                    barcode: bill.barcode,
                    value: Number(bill.value),
                    dueDate: bill.dueDate,
                    paymentDate: hoje,
                    beneficiary: bill.beneficiary || bill.supplier?.name || null,
                    description: bill.description,
                });
            } else if (bill.paymentMethod === 'PIX') {
                if (!bill.pixKey) {
                    ignoradas.push({
                        id: bill.id,
                        description: bill.description,
                        motivo: 'PIX sem chave cadastrada.',
                    });
                    continue;
                }

                pixPagamentos.push({
                    billId: bill.id,
                    value: Number(bill.value),
                    paymentDate: hoje,
                    beneficiary: bill.beneficiary || bill.supplier?.name || null,
                    bankName: bill.bankName,
                    bankAgency: bill.bankAgency,
                    bankAccount: bill.bankAccount,
                    pixKey: bill.pixKey,
                    description: bill.description,
                });
            } else {
                ignoradas.push({
                    id: bill.id,
                    description: bill.description,
                    motivo:
                        'Forma de pagamento não entra no lote (só boleto e PIX por enquanto).',
                });
            }
        }

        if (boletos.length === 0 && pixPagamentos.length === 0) {
            throw new BadRequestException(
                'Nenhuma conta de hoje é boleto ou PIX com os dados bancários completos — nada pra incluir no lote.',
            );
        }

        const conteudo = buildCnab240Remessa(
            {
                bankCode: convenio.bankCode,
                convenioCode: convenio.convenioCode,
                agencia: convenio.agencia,
                agenciaDv: convenio.agenciaDv,
                conta: convenio.conta,
                contaDv: convenio.contaDv,
                companyName: convenio.companyName,
                companyCnpj: convenio.companyCnpj,
            },
            boletos,
            pixPagamentos,
        );

        return {
            conteudo,
            resumo: {
                totalBoletos: boletos.length,
                totalPix: pixPagamentos.length,
                ignoradas,
            },
        };
    }

    private defaultInclude() {
        return {
            store: true,
            supplier: true,
            category: true,
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