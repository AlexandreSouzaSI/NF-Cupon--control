import { ForbiddenException, Injectable } from '@nestjs/common';
import { BillStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Dashboard Financeiro — só Contas a Pagar (NF de entrada/serviço e Perdas
// já têm tela própria, tirado daqui de propósito). Os buckets de
// hoje/semana/mês agrupam por `dueDate` (data de vencimento), não por
// `paidAt` — assim uma conta que vence essa semana entra no bucket "essa
// semana" independente de já ter sido paga ou não, e dá pra comparar
// "pagas" x "a pagar" dentro do mesmo período de vencimento. `vencidas` é
// à parte (só o que já passou do vencimento e ainda está em aberto). O
// Top 5 de maiores pagamentos continua seguindo o mês navegável no topo da
// tela (filtra por `paidAt`), diferente dos buckets ao vivo.
@Injectable()
export class FinancialDashboardService {
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

    // Intervalo do mês (1º dia 00:00 até 1º dia do mês seguinte) — usado só
    // pro Top 5 de pagamentos, que segue o seletor de mês do topo.
    private monthRange(month: number, year: number) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        return { gte: start, lt: end };
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

    // Segunda-feira 00:00 da semana corrente até a segunda seguinte — a
    // semana inteira, não só "do início até agora", já que agora o bucket
    // conta conta a pagar futura dentro da mesma semana também.
    private startOfThisWeek() {
        const today = this.startOfToday();
        const weekday = today.getDay(); // 0 = domingo
        const diffToMonday = weekday === 0 ? 6 : weekday - 1;

        const start = new Date(today);
        start.setDate(start.getDate() - diffToMonday);
        return start;
    }

    private startOfNextWeek() {
        const start = this.startOfThisWeek();
        start.setDate(start.getDate() + 7);
        return start;
    }

    private startOfThisMonth() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    private startOfNextMonth() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }

    private async bucket(
        storeId: string,
        dueDateRange: { gte: Date; lt: Date },
    ) {
        const [pagas, aPagar] = await Promise.all([
            this.prisma.bill.aggregate({
                where: {
                    storeId,
                    status: BillStatus.PAID,
                    dueDate: dueDateRange,
                },
                _sum: { value: true },
                _count: true,
            }),
            this.prisma.bill.aggregate({
                where: {
                    storeId,
                    status: { in: [BillStatus.OPEN, BillStatus.OVERDUE] },
                    dueDate: dueDateRange,
                },
                _sum: { value: true },
                _count: true,
            }),
        ]);

        return {
            pagas: {
                count: pagas._count,
                value: Number(pagas._sum.value || 0),
            },
            aPagar: {
                count: aPagar._count,
                value: Number(aPagar._sum.value || 0),
            },
        };
    }

    async summary(
        user: any,
        filters: { storeId: string; month: number; year: number },
    ) {
        this.ensureStoreAccess(filters.storeId, user);

        const { storeId } = filters;
        const range = this.monthRange(filters.month, filters.year);

        const [topPagamentos, hoje, semana, mes, vencidas] =
            await Promise.all([
                this.prisma.bill.findMany({
                    where: {
                        storeId,
                        status: BillStatus.PAID,
                        paidAt: range,
                    },
                    orderBy: { value: 'desc' },
                    take: 5,
                    include: { category: true, supplier: true },
                }),
                this.bucket(storeId, {
                    gte: this.startOfToday(),
                    lt: this.startOfTomorrow(),
                }),
                this.bucket(storeId, {
                    gte: this.startOfThisWeek(),
                    lt: this.startOfNextWeek(),
                }),
                this.bucket(storeId, {
                    gte: this.startOfThisMonth(),
                    lt: this.startOfNextMonth(),
                }),
                this.prisma.bill.aggregate({
                    where: {
                        storeId,
                        status: { in: [BillStatus.OPEN, BillStatus.OVERDUE] },
                        dueDate: { lt: this.startOfToday() },
                    },
                    _sum: { value: true },
                    _count: true,
                }),
            ]);

        const totalMes = {
            count: mes.pagas.count + mes.aPagar.count,
            value: mes.pagas.value + mes.aPagar.value,
        };

        return {
            period: { month: filters.month, year: filters.year },
            pagamentos: {
                hoje,
                semana,
                mes,
                vencidas: {
                    count: vencidas._count,
                    value: Number(vencidas._sum.value || 0),
                },
            },
            totalMes,
            topPagamentos: topPagamentos.map((bill) => ({
                id: bill.id,
                description: bill.description,
                value: Number(bill.value),
                paidAt: bill.paidAt,
                categoria: bill.category?.name || null,
                fornecedor: bill.supplier?.name || null,
            })),
        };
    }
}
