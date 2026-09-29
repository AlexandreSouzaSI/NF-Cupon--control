import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UpsertCashReconciliationDto } from './dto/upsert-cash-reconciliation.dto';
import {
    buildCashReconciliationPdf,
    CashReconciliationReportData,
} from './cash-reconciliation-report-builder';

@Injectable()
export class CashReconciliationService {
    constructor(private prisma: PrismaService) { }

    // Mesmo critério de acesso por loja usado em bills.service.ts —
    // Administrativo/Proprietário enxergam todas, o resto só as lojas
    // vinculadas no próprio cadastro (UserStore).
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
        if (!allowedStoreIds) return;
        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    private toDate(value: string): Date {
        return new Date(`${value}T12:00:00.000Z`);
    }

    // Upsert por loja+data — lançar de novo no mesmo dia atualiza em vez
    // de duplicar (ver @@unique([storeId, date]) no schema).
    async upsert(dto: UpsertCashReconciliationDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const date = this.toDate(dto.date);

        return this.prisma.cashReconciliation.upsert({
            where: {
                storeId_date: { storeId: dto.storeId, date },
            },
            create: {
                storeId: dto.storeId,
                date,
                systemCash: dto.systemCash,
                systemDebit: dto.systemDebit,
                systemCredit: dto.systemCredit,
                bankCash: dto.bankCash,
                bankDebit: dto.bankDebit,
                bankCredit: dto.bankCredit,
                otherSystem: dto.otherSystem ?? 0,
                otherBank: dto.otherBank ?? 0,
                otherDescription: dto.otherDescription,
                withdrawalAmount: dto.withdrawalAmount ?? 0,
                withdrawalReason: dto.withdrawalReason,
                notes: dto.notes,
                launchedById: user.id,
            },
            update: {
                systemCash: dto.systemCash,
                systemDebit: dto.systemDebit,
                systemCredit: dto.systemCredit,
                bankCash: dto.bankCash,
                bankDebit: dto.bankDebit,
                bankCredit: dto.bankCredit,
                otherSystem: dto.otherSystem ?? 0,
                otherBank: dto.otherBank ?? 0,
                otherDescription: dto.otherDescription,
                withdrawalAmount: dto.withdrawalAmount ?? 0,
                withdrawalReason: dto.withdrawalReason,
                notes: dto.notes,
                launchedById: user.id,
            },
        });
    }

    // Remover uma conciliação salva — mesmo controle de acesso por loja do
    // resto do módulo.
    async remove(id: string, user: any) {
        const record = await this.prisma.cashReconciliation.findUnique({
            where: { id },
        });

        if (!record) {
            throw new NotFoundException('Conciliação não encontrada.');
        }

        this.ensureStoreAccess(record.storeId, user);

        await this.prisma.cashReconciliation.delete({ where: { id } });

        return { success: true };
    }

    // Conciliação do dia atual pra loja — usada pelo card no Dashboard
    // Financeiro. Mesmo horário intermediário (meio-dia UTC) usado no
    // upsert, pra bater com o registro salvo pelo <input type="date">.
    async findToday(storeId: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const now = new Date();
        const todayIso = now.toISOString().slice(0, 10);
        const date = this.toDate(todayIso);

        return this.prisma.cashReconciliation.findUnique({
            where: { storeId_date: { storeId, date } },
        });
    }

    // page/pageSize sempre vêm do frontend hoje (conciliacao-caixa/page.tsx
    // já manda os dois em toda chamada), mas antes o fallback sem os dois
    // parâmetros trazia a tabela inteira sem paginação nenhuma — trocado
    // por um default fixo pra fechar essa brecha de vez.
    async findAll(
        storeId: string,
        user: any,
        page?: number,
        pageSize?: number,
    ) {
        this.ensureStoreAccess(storeId, user);

        const where = { storeId };
        const resolvedPage = page && page > 0 ? page : 1;
        const resolvedPageSize = pageSize && pageSize > 0 ? pageSize : 30;

        const [items, total] = await Promise.all([
            this.prisma.cashReconciliation.findMany({
                where,
                orderBy: { date: 'desc' },
                skip: (resolvedPage - 1) * resolvedPageSize,
                take: resolvedPageSize,
                include: { launchedBy: { select: { name: true } } },
            }),
            this.prisma.cashReconciliation.count({ where }),
        ]);

        return { items, total, page: resolvedPage, pageSize: resolvedPageSize };
    }

    async findOne(id: string, user: any) {
        const record = await this.prisma.cashReconciliation.findUnique({
            where: { id },
            include: {
                launchedBy: { select: { name: true } },
                store: { select: { name: true } },
            },
        });

        if (!record) {
            throw new NotFoundException('Conciliação não encontrada.');
        }

        this.ensureStoreAccess(record.storeId, user);

        return record;
    }

    async getReportPdf(id: string, user: any): Promise<Buffer> {
        const record = await this.findOne(id, user);

        const data: CashReconciliationReportData = {
            storeName: record.store.name,
            date: record.date,
            systemCash: Number(record.systemCash),
            systemDebit: Number(record.systemDebit),
            systemCredit: Number(record.systemCredit),
            bankCash: Number(record.bankCash),
            bankDebit: Number(record.bankDebit),
            bankCredit: Number(record.bankCredit),
            otherSystem: Number(record.otherSystem),
            otherBank: Number(record.otherBank),
            otherDescription: record.otherDescription,
            withdrawalAmount: Number(record.withdrawalAmount),
            withdrawalReason: record.withdrawalReason,
            notes: record.notes,
            launchedByName: record.launchedBy.name,
        };

        return buildCashReconciliationPdf(data);
    }
}
