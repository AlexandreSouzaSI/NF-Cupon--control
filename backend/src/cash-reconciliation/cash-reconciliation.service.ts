import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';
import { UpsertCashReconciliationDto } from './dto/upsert-cash-reconciliation.dto';
import {
    buildCashReconciliationPdf,
    type CashReconciliationReportData,
} from './cash-reconciliation-report-builder';

// Conciliação manual banco x sistema, por loja e por dia — não existe
// integração com PDV/frente de caixa hoje, então "o que entrou no
// sistema" também é digitado por quem faz a conferência. Ver
// CashReconciliation no schema.prisma pro porquê da quebra por forma de
// pagamento nos dois lados (aponta onde exatamente está a diferença, não
// só o total). Essa tela é separada da aba "Conciliação de Caixa" dentro
// de Vendas Meep (ver meep-query.service.ts/CashConciliationTab.tsx), que
// confere o que a Meep já fechou automaticamente por forma de pagamento —
// aqui é o lançamento manual do dia (pode nem ter Meep na loja).
@Injectable()
export class CashReconciliationService {
    constructor(private prisma: PrismaService) {}

    // Delega pro helper compartilhado (src/common/store-scope.util.ts) —
    // corrige vazamento cross-empresa: antes, ADMINISTRATIVO/PROPRIETARIO
    // de qualquer empresa via/mexia em dado de qualquer outra (undefined =
    // sem filtro nenhum, escrito quando só existia uma empresa no banco).
    private async ensureStoreAccess(storeId: string, user: any) {
        return ensureStoreAccessScoped(this.prisma, storeId, user);
    }

    // "AAAA-MM-DD" vindo de <input type="date"> — convertido com horário
    // intermediário (meio-dia UTC), mesmo padrão do resto do projeto, pra
    // não recuar um dia por causa do fuso.
    private parseDate(value: string): Date {
        return new Date(`${value}T12:00:00.000Z`);
    }

    async upsert(dto: UpsertCashReconciliationDto, user: any) {
        await this.ensureStoreAccess(dto.storeId, user);

        const date = this.parseDate(dto.date);
        const data = {
            storeId: dto.storeId,
            date,
            systemCash: dto.systemCash,
            systemDebit: dto.systemDebit,
            systemCredit: dto.systemCredit,
            bankCash: dto.bankCash,
            bankDebit: dto.bankDebit,
            bankCredit: dto.bankCredit,
            notes: dto.notes ?? null,
            launchedById: user.id,
        };

        return this.prisma.cashReconciliation.upsert({
            where: { storeId_date: { storeId: dto.storeId, date } },
            create: data,
            update: data,
        });
    }

    async findAll(
        storeId: string,
        user: any,
        page = 1,
        pageSize = 10,
    ) {
        await this.ensureStoreAccess(storeId, user);

        const take = Math.min(Math.max(pageSize, 1), 50);
        const skip = (Math.max(page, 1) - 1) * take;

        const [items, total] = await Promise.all([
            this.prisma.cashReconciliation.findMany({
                where: { storeId },
                orderBy: { date: 'desc' },
                skip,
                take,
                include: { launchedBy: { select: { name: true } } },
            }),
            this.prisma.cashReconciliation.count({ where: { storeId } }),
        ]);

        return { items, total };
    }

    async findToday(storeId: string, user: any) {
        await this.ensureStoreAccess(storeId, user);

        const hojeIso = new Date().toISOString().slice(0, 10);
        const date = this.parseDate(hojeIso);

        return this.prisma.cashReconciliation.findUnique({
            where: { storeId_date: { storeId, date } },
        });
    }

    private async findRecordOrThrow(id: string) {
        const record = await this.prisma.cashReconciliation.findUnique({
            where: { id },
        });

        if (!record) {
            throw new NotFoundException('Conciliação não encontrada.');
        }

        return record;
    }

    async findOne(id: string, user: any) {
        const record = await this.findRecordOrThrow(id);
        await this.ensureStoreAccess(record.storeId, user);
        return record;
    }

    async remove(id: string, user: any) {
        const record = await this.findRecordOrThrow(id);
        await this.ensureStoreAccess(record.storeId, user);

        await this.prisma.cashReconciliation.delete({ where: { id } });
        return { success: true };
    }

    async getReportPdf(id: string, user: any): Promise<Buffer> {
        const record = await this.prisma.cashReconciliation.findUnique({
            where: { id },
            include: {
                store: { select: { name: true } },
                launchedBy: { select: { name: true } },
            },
        });

        if (!record) {
            throw new NotFoundException('Conciliação não encontrada.');
        }

        await this.ensureStoreAccess(record.storeId, user);

        const data: CashReconciliationReportData = {
            storeName: record.store.name,
            date: record.date,
            systemCash: Number(record.systemCash),
            systemDebit: Number(record.systemDebit),
            systemCredit: Number(record.systemCredit),
            bankCash: Number(record.bankCash),
            bankDebit: Number(record.bankDebit),
            bankCredit: Number(record.bankCredit),
            notes: record.notes,
            launchedByName: record.launchedBy?.name ?? '—',
        };

        return buildCashReconciliationPdf(data);
    }
}
