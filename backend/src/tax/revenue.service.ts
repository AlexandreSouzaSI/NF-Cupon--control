import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateRevenueEntryDto } from './dto/create-revenue-entry.dto';
import { UpdateRevenueEntryDto } from './dto/update-revenue-entry.dto';

@Injectable()
export class RevenueService {
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

        if (!allowedStoreIds) return;

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    async create(dto: CreateRevenueEntryDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        // Um lançamento por loja/mês — se já existir, atualiza em vez de
        // duplicar (evita erro de unique constraint numa correção de valor).
        return this.prisma.revenueEntry.upsert({
            where: {
                storeId_referenceMonth: {
                    storeId: dto.storeId,
                    referenceMonth: dto.referenceMonth,
                },
            },
            update: {
                grossRevenue: dto.grossRevenue,
                notes: dto.notes,
            },
            create: {
                storeId: dto.storeId,
                referenceMonth: dto.referenceMonth,
                grossRevenue: dto.grossRevenue,
                notes: dto.notes,
                createdById: user.id,
            },
            include: this.defaultInclude(),
        });
    }

    async findAll(user: any, filters?: { storeId?: string }) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.revenueEntry.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
            },
            orderBy: {
                referenceMonth: 'desc',
            },
            include: this.defaultInclude(),
        });
    }

    async update(id: string, dto: UpdateRevenueEntryDto, user: any) {
        const entry = await this.ensureEntryAccess(id, user);

        return this.prisma.revenueEntry.update({
            where: { id: entry.id },
            data: {
                grossRevenue: dto.grossRevenue,
                notes: dto.notes,
            },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        const entry = await this.ensureEntryAccess(id, user);

        await this.prisma.revenueEntry.delete({ where: { id: entry.id } });

        return { success: true };
    }

    // Soma o faturamento dos últimos 12 meses até referenceMonth (inclusive)
    // — é o RBT12 que a fórmula do Simples Nacional exige. Meses sem
    // lançamento contam como zero (não interrompe o cálculo, só fica
    // impreciso até todos os meses serem preenchidos).
    async getRbt12(storeId: string, referenceMonth: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const months = this.last12MonthsUpTo(referenceMonth);

        const entries = await this.prisma.revenueEntry.findMany({
            where: {
                storeId,
                referenceMonth: { in: months },
            },
        });

        const total = entries.reduce(
            (sum, entry) => sum + Number(entry.grossRevenue),
            0,
        );

        return { referenceMonth, months, total, monthsWithData: entries.length };
    }

    private last12MonthsUpTo(referenceMonth: string): string[] {
        const [yearStr, monthStr] = referenceMonth.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr); // 1-12

        const months: string[] = [];

        for (let i = 0; i < 12; i++) {
            const offset = month - 1 - i;
            const y = year + Math.floor(offset / 12);
            const m = ((offset % 12) + 12) % 12;

            months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
        }

        return months;
    }

    private async ensureEntryAccess(id: string, user: any) {
        const entry = await this.prisma.revenueEntry.findUnique({
            where: { id },
        });

        if (!entry) {
            throw new NotFoundException('Lançamento de faturamento não encontrado.');
        }

        this.ensureStoreAccess(entry.storeId, user);

        return entry;
    }

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
        };
    }
}
