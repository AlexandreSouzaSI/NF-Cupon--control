import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import {
    BillStatus,
    PurchaseHistoryAction,
    PurchaseStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { CreateBillRecorrenciaDto } from './dto/create-bill-recorrencia.dto';
import { UpdateBillDto } from './dto/update-bill.dto';
import { parseOfx } from './ofx-parser';
import { buildTodayReportPdf } from './bills-report-builder';
import {
    buildCnab240Remessa,
    BoletoPagamento,
    PixPagamento,
} from './cnab240-sicredi-builder';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';

@Injectable()
export class BillsService {
    constructor(private prisma: PrismaService) { }

    // Delega pro helper compartilhado — ver comentário em
    // src/common/store-scope.util.ts sobre a correção de vazamento
    // cross-empresa (antes, ADMINISTRATIVO/PROPRIETARIO de qualquer
    // empresa via/mexia em conta a pagar de qualquer outra).
    private async getAllowedStoreIds(user: any): Promise<string[] | undefined> {
        return resolveAllowedStoreIds(this.prisma, user);
    }

    private async ensureStoreAccess(storeId: string, user: any) {
        return ensureStoreAccessScoped(this.prisma, storeId, user);
    }

    // Quem não tem canViewPayrollBills nem vê a conta na lista (não só o
    // valor escondido) quando a categoria é Funcionários ou Freelancer —
    // categoria é texto livre (BillCategory), então casa por substring
    // normalizada (sem acento/caixa) pra pegar variações tipo "Freelancers".
    private payrollCategoryFilter(user: any) {
        if (user.canViewPayrollBills !== false) return undefined;

        return {
            NOT: {
                category: {
                    OR: [
                        { nameNormalized: { contains: 'funcionario' } },
                        { nameNormalized: { contains: 'freelance' } },
                    ],
                },
            },
        };
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
                category: { select: { nameNormalized: true } },
            },
        });

        if (!bill) {
            throw new NotFoundException(
                'Conta a pagar não encontrada.',
            );
        }

        await this.ensureStoreAccess(bill.storeId, user);

        if (
            user.canViewPayrollBills === false &&
            bill.category &&
            (bill.category.nameNormalized.includes('funcionario') ||
                bill.category.nameNormalized.includes('freelance'))
        ) {
            throw new NotFoundException(
                'Conta a pagar não encontrada.',
            );
        }

        return bill;
    }

    async create(dto: CreateBillDto, user: any) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para cadastrar contas a pagar.',
            );
        }

        await this.ensureStoreAccess(dto.storeId, user);

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

        const dueDateValue = new Date(
            `${dto.dueDate}T12:00:00.000Z`,
        );

        const bill = await this.prisma.bill.create({
            data: {
                description: dto.description,
                value: dto.value,
                type: dto.type,
                paymentMethod: dto.paymentMethod,

                dueDate: dueDateValue,

                // Antes toda conta nascia OPEN e "vencida" só existia como
                // cálculo de tela (comparando dueDate com hoje no
                // frontend). Isso deixava o status no banco errado sempre
                // que a conta era cadastrada já com vencimento passado
                // (ex.: lançamento atrasado de uma NF antiga) — qualquer
                // relatório/export que lesse `status` direto do banco
                // mostrava "aberta" mesmo já vencida. Calculando aqui já
                // no cadastro; o cron `markOverdueBills` cobre o caso de
                // uma conta que nasce OPEN e vence depois, sem edição.
                status: this.computeStatusForDueDate(dueDateValue),

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
            await this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            await this.ensureStoreAccess(filters.storeId, user);
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
            ...this.payrollCategoryFilter(user),
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
        // page/pageSize. E a tela hoje nem sempre manda startDate/endDate
        // (ex.: filtro por fornecedor sozinho), então sem NENHUM limite a
        // query cresce sem fim conforme acumula contas — `take` generoso
        // como cinto de segurança, sem mudar o formato da resposta.
        if (!filters?.page && !filters?.pageSize) {
            return this.prisma.bill.findMany({
                where,
                orderBy,
                include: this.defaultInclude(),
                take: 3000,
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
            await this.ensureStoreAccess(dto.storeId, user);
        }

        const dueDateValue = dto.dueDate
            ? new Date(`${dto.dueDate}T12:00:00.000Z`)
            : undefined;

        // Se quem chamou não mandou `status` explícito (ex.: marcar como
        // paga/cancelada é sempre explícito) mas mudou o vencimento de uma
        // conta que ainda está OPEN/OVERDUE, recalcula o status aqui —
        // senão editar o vencimento pra uma data futura deixava a conta
        // "presa" como vencida no banco (mesmo problema do create: status
        // nunca refletia a dueDate de verdade).
        const statusToPersist =
            dto.status ||
            (dueDateValue &&
                (currentBill.status === BillStatus.OPEN ||
                    currentBill.status === BillStatus.OVERDUE)
                ? this.computeStatusForDueDate(dueDateValue)
                : undefined);

        const bill = await this.prisma.bill.update({
            where: { id },

            data: {
                description: dto.description,
                value: dto.value,
                type: dto.type,
                paymentMethod: dto.paymentMethod,

                dueDate: dueDateValue,

                paidAt: dto.paidAt
                    ? new Date(dto.paidAt)
                    : undefined,

                status: statusToPersist,

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

    // Único lugar que decide "essa conta está vencida?" a partir da
    // dueDate — usado no cadastro, na edição e no cron diário, pra não
    // reimplementar a mesma regra em três lugares de formas levemente
    // diferentes.
    private computeStatusForDueDate(dueDate: Date): BillStatus {
        return dueDate < this.startOfToday()
            ? BillStatus.OVERDUE
            : BillStatus.OPEN;
    }

    // Persiste "vencida" no banco de verdade — antes disso, bill.status só
    // saía de OPEN quando alguém marcava como paga/cancelada manualmente;
    // "vencida" existia apenas como cálculo feito na hora (no frontend, e
    // duplicado em 3 pontos deste service). Isso é inofensivo pra quem só
    // usa a tela, mas deixa o dado errado pra qualquer consulta/relatório
    // que leia `status` direto do banco (SQL, export, integração futura).
    // Roda 1x por dia de madrugada: marca OVERDUE quem venceu e reverte
    // pra OPEN quem foi editado de volta pra uma data futura enquanto
    // ainda estava OVERDUE (evita ficar "vencida" presa após correção).
    @Cron('10 0 * * *', { timeZone: 'America/Sao_Paulo' })
    async markOverdueBills() {
        const today = this.startOfToday();

        await this.prisma.bill.updateMany({
            where: {
                status: BillStatus.OPEN,
                dueDate: { lt: today },
            },
            data: { status: BillStatus.OVERDUE },
        });

        await this.prisma.bill.updateMany({
            where: {
                status: BillStatus.OVERDUE,
                dueDate: { gte: today },
            },
            data: { status: BillStatus.OPEN },
        });
    }

    // -----------------------------------------------------------------
    // Conta a Pagar recorrente (BillRecorrencia) — mesma lógica já
    // validada no Controle Rota pra ContaPagarRecorrencia: a cada
    // ciclo gera um Bill normal (campo Bill.recorrenciaId aponta pra
    // essa recorrência), sempre MESES_GERACAO_RECORRENCIA meses à
    // frente. Editar/excluir um Bill já gerado não afeta a recorrência
    // nem as demais ocorrências.
    // -----------------------------------------------------------------

    private readonly MESES_GERACAO_RECORRENCIA = 12;

    private ultimoDiaDoMes(ano: number, mesIndex: number): number {
        return new Date(ano, mesIndex + 1, 0).getDate();
    }

    async createRecorrencia(
        dto: CreateBillRecorrenciaDto,
        user: any,
    ) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para cadastrar contas a pagar.',
            );
        }

        await this.ensureStoreAccess(dto.storeId, user);

        if (dto.recurrence === 'MONTHLY') {
            if (!dto.dayOfMonth || dto.dayOfMonth < 1 || dto.dayOfMonth > 30) {
                throw new BadRequestException(
                    'Escolha um dia do mês entre 1 e 30.',
                );
            }
        } else if (dto.recurrence === 'WEEKLY') {
            if (dto.weekday === undefined || dto.weekday === null) {
                throw new BadRequestException(
                    'Escolha o dia da semana da recorrência.',
                );
            }
        } else {
            throw new BadRequestException('Tipo de recorrência inválido.');
        }

        const recorrencia = await this.prisma.billRecorrencia.create({
            data: {
                description: dto.description,
                value: dto.value,
                recurrence: dto.recurrence,
                weekday: dto.recurrence === 'WEEKLY' ? dto.weekday : null,
                dayOfMonth:
                    dto.recurrence === 'MONTHLY' ? dto.dayOfMonth : null,
                type: dto.type,
                paymentMethod: dto.paymentMethod,
                storeId: dto.storeId,
                categoryId: dto.categoryId,
                supplierId: dto.supplierId,
                createdById: user.id,
            },
        });

        // Gera as ocorrências na hora, sem esperar o cron da madrugada —
        // senão a recorrência cadastrada agora só apareceria na lista de
        // Contas a Pagar no dia seguinte.
        await this.gerarOcorrenciasRecorrencia(recorrencia.id);

        return this.prisma.billRecorrencia.findUnique({
            where: { id: recorrencia.id },
        });
    }

    async listRecorrencias(storeId: string, user: any) {
        await this.ensureStoreAccess(storeId, user);

        return this.prisma.billRecorrencia.findMany({
            where: { storeId, active: true },
            include: {
                category: true,
                supplier: true,
            },
            orderBy: { description: 'asc' },
        });
    }

    // "Excluir" uma recorrência só desativa a receita (não gera mais
    // ocorrências novas) — os Bills já gerados continuam existindo
    // normalmente, o usuário exclui cada um à parte se quiser.
    async toggleRecorrenciaActive(id: string, active: boolean, user: any) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para gerenciar contas a pagar.',
            );
        }

        const recorrencia = await this.prisma.billRecorrencia.findUnique({
            where: { id },
        });

        if (!recorrencia) {
            throw new NotFoundException('Conta recorrente não encontrada.');
        }

        await this.ensureStoreAccess(recorrencia.storeId, user);

        await this.prisma.billRecorrencia.update({
            where: { id },
            data: { active },
        });

        if (active) {
            await this.gerarOcorrenciasRecorrencia(id);
        }

        return { ok: true };
    }

    // Gera as ocorrências concretas (Bill) de uma recorrência, desde o
    // que já foi gerado (generatedUntil) até MESES_GERACAO_RECORRENCIA
    // meses a partir de hoje — idempotente: o @@unique([recorrenciaId,
    // dueDate]) garante que rodar duas vezes não duplica nada.
    private async gerarOcorrenciasRecorrencia(recorrenciaId: string) {
        const recorrencia = await this.prisma.billRecorrencia.findUnique({
            where: { id: recorrenciaId },
        });

        if (!recorrencia || !recorrencia.active) {
            return { geradas: 0 };
        }

        const hoje = this.startOfToday();

        const limite = new Date(hoje);
        limite.setMonth(
            limite.getMonth() + this.MESES_GERACAO_RECORRENCIA,
        );

        const vencimentos: Date[] = [];

        // `hoje`/`limite` e os cursores abaixo usam componentes LOCAIS de
        // data (mesma convenção de startOfToday()) só pra decidir QUAIS
        // datas de calendário caem na recorrência — o Date final gravado
        // sempre usa Date.UTC(...,12,0,0), igual ao resto do bills.service
        // (dueDate = `${string}T12:00:00.000Z`), pra nunca recuar de dia
        // por fuso quando ler/comparar depois.
        if (recorrencia.recurrence === 'MONTHLY' && recorrencia.dayOfMonth) {
            const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

            while (cursor <= limite) {
                const dia = Math.min(
                    recorrencia.dayOfMonth,
                    this.ultimoDiaDoMes(cursor.getFullYear(), cursor.getMonth()),
                );
                const vencimento = new Date(
                    Date.UTC(cursor.getFullYear(), cursor.getMonth(), dia, 12, 0, 0),
                );

                if (vencimento >= hoje) {
                    vencimentos.push(vencimento);
                }

                cursor.setMonth(cursor.getMonth() + 1);
            }
        } else if (
            recorrencia.recurrence === 'WEEKLY' &&
            recorrencia.weekday !== null &&
            recorrencia.weekday !== undefined
        ) {
            const cursor = new Date(hoje);

            while (cursor <= limite) {
                if (cursor.getDay() === recorrencia.weekday) {
                    vencimentos.push(
                        new Date(
                            Date.UTC(
                                cursor.getFullYear(),
                                cursor.getMonth(),
                                cursor.getDate(),
                                12,
                                0,
                                0,
                            ),
                        ),
                    );
                }

                cursor.setUTCDate(cursor.getUTCDate() + 1);
            }
        }

        let geradas = 0;

        for (const vencimento of vencimentos) {
            try {
                await this.prisma.bill.create({
                    data: {
                        description: recorrencia.description,
                        value: recorrencia.value,
                        type: recorrencia.type,
                        paymentMethod: recorrencia.paymentMethod,
                        dueDate: vencimento,
                        status: this.computeStatusForDueDate(vencimento),
                        storeId: recorrencia.storeId,
                        categoryId: recorrencia.categoryId,
                        supplierId: recorrencia.supplierId,
                        launchedById: recorrencia.createdById,
                        recorrenciaId: recorrencia.id,
                    },
                });

                geradas++;
            } catch {
                // Já existe ocorrência pra essa data (@@unique) — esperado
                // quando o cron roda de novo sem nada novo pra gerar.
            }
        }

        await this.prisma.billRecorrencia.update({
            where: { id: recorrencia.id },
            data: { generatedUntil: limite },
        });

        return { geradas };
    }

    // Cron diário (madrugada) — garante que toda recorrência ativa sempre
    // tem ~12 meses de ocorrências futuras geradas, sem depender do
    // usuário abrir a tela de Contas a Pagar.
    @Cron('20 0 * * *', { timeZone: 'America/Sao_Paulo' })
    async estenderOcorrenciasRecorrentes() {
        const recorrencias = await this.prisma.billRecorrencia.findMany({
            where: { active: true },
        });

        for (const recorrencia of recorrencias) {
            try {
                await this.gerarOcorrenciasRecorrencia(recorrencia.id);
            } catch (error) {
                // Uma recorrência com erro não deve travar as outras.
                console.error(
                    `Erro ao estender BillRecorrencia ${recorrencia.id}:`,
                    error,
                );
            }
        }
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
    // conta OPEN/OVERDUE com dueDate no passado e ainda não marcada, e
    // marca de uma vez. Não mexe em quem já estava marcada (fica como
    // estava) nem em conta paga/cancelada. Aceita OPEN também porque o
    // cron `markOverdueBills` roda 1x por dia — uma conta pode ter vencido
    // hoje e ainda não ter sido promovida a OVERDUE no banco quando esse
    // botão for clicado.
    async queueAllOverdueToday(user: any, storeId?: string) {
        if (!this.canManageBills(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para gerenciar contas a pagar.',
            );
        }

        if (storeId) {
            await this.ensureStoreAccess(storeId, user);
        }

        const allowedStoreIds = await this.getAllowedStoreIds(user);

        const vencidas = await this.prisma.bill.findMany({
            where: {
                status: { in: [BillStatus.OPEN, BillStatus.OVERDUE] },
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
        const allowedStoreIds = await this.getAllowedStoreIds(user);

        if (storeId) {
            await this.ensureStoreAccess(storeId, user);
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

    // PaymentBatchConfig.empresaId agora é obrigatório no banco (e único
    // por empresa) — mesmo motivo do requireEmpresaId em
    // suppliers.service.ts: erro claro em vez de estourar a constraint NOT
    // NULL do Prisma. Admin Master usa a empresa da loja ativa
    // (activeStoreEmpresaId, ver jwt.strategy.ts) — sem loja ativa
    // selecionada não dá pra saber de qual empresa é o convênio bancário
    // que ele quer configurar, então também exige.
    private requireEmpresaId(user: any): string {
        const empresaId = user?.isAdminMaster
            ? user?.activeStoreEmpresaId
            : user?.empresaId;

        if (!empresaId) {
            throw new BadRequestException(
                'Não foi possível identificar sua empresa pra configurar o pagamento em lote. Selecione uma loja no topo do sistema.',
            );
        }

        return empresaId;
    }

    async getPaymentBatchConfig(user: any) {
        if (!this.canManagePaymentBatch(user)) {
            throw new ForbiddenException(
                'Seu perfil não tem permissão para ver a configuração de pagamento em lote.',
            );
        }

        // Multi-tenant: era "o único registro do banco todo" — dado
        // bancário sensível (agência/conta) compartilhado entre TODAS as
        // empresas-cliente. Agora é 1 registro por empresa.
        const empresaId = this.requireEmpresaId(user);

        return this.prisma.paymentBatchConfig.findFirst({
            where: { empresaId },
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

        const empresaId = this.requireEmpresaId(user);

        // Único registro por empresa — se já existe o da empresa de quem
        // está editando, atualiza; se não, cria. Evita ficar acumulando
        // linha velha a cada edição, e nunca mexe no convênio de outra
        // empresa-cliente.
        const existing = await this.prisma.paymentBatchConfig.findFirst({
            where: { empresaId },
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
            empresaId,
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
            where: { empresaId: this.requireEmpresaId(user) },
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