import { ForbiddenException, Injectable } from '@nestjs/common';
import { BillStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';
import { brasiliaDueDateRanges } from '../common/brasilia-date.util';

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

    // Delega pro helper compartilhado (src/common/store-scope.util.ts) — corrige vazamento cross-empresa: antes, ADMINISTRATIVO/PROPRIETARIO de qualquer empresa via/mexia em dado de qualquer outra (undefined = sem filtro nenhum, escrito quando só existia uma empresa no banco).
    private async getAllowedStoreIds(user: any): Promise<string[] | undefined> {
        return resolveAllowedStoreIds(this.prisma, user);
    }

    private async ensureStoreAccess(storeId: string, user: any) {
        return ensureStoreAccessScoped(this.prisma, storeId, user);
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
        await this.ensureStoreAccess(filters.storeId, user);

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

    // Visão enxuta pra loja Pessoa Física (só Contas a Pagar): quatro
    // números em destaque — Atrasadas, Hoje, Próximos 7 dias e Restante do
    // mês — mais as próximas contas em aberto. Diferente do summary()
    // acima, aqui só entra conta EM ABERTO (OPEN/OVERDUE), os recortes são
    // calculados no fuso de Brasília e o "Hoje" segue a mesma regra da tela
    // de Contas a Pagar: vence hoje + vencidas que alguém colocou na fila
    // de hoje (queuedForPaymentAt). Essas vencidas continuam também em
    // "Atrasadas" (é a mesma conta vista por dois ângulos), por isso o
    // "hoje" devolve o detalhamento pra a tela poder avisar disso.
    // Bill não tem pagamento parcial neste projeto (PARCIAL é do Controle
    // Rota), então o valor somado é sempre o valor cheio da conta.
    async overviewFisica(user: any, storeId: string) {
        await this.ensureStoreAccess(storeId, user);

        const { todayStart, tomorrowStart, weekEnd, monthEnd } =
            brasiliaDueDateRanges();

        // Mesma regra de bills.service.ts (payrollCategoryFilter): quem não
        // tem canViewPayrollBills não enxerga conta de Funcionários/Freelancer,
        // nem somada nos totais.
        const payrollFilter =
            user.canViewPayrollBills === false
                ? {
                    NOT: {
                        category: {
                            OR: [
                                { nameNormalized: { contains: 'funcionario' } },
                                { nameNormalized: { contains: 'freelance' } },
                            ],
                        },
                    },
                }
                : {};

        const open = {
            storeId,
            status: { in: [BillStatus.OPEN, BillStatus.OVERDUE] },
            ...payrollFilter,
        };

        const sum = (dueDate: { gte?: Date; lt?: Date }, extra: object = {}) =>
            this.prisma.bill.aggregate({
                where: { ...open, dueDate, ...extra },
                _sum: { value: true },
                _count: true,
            });

        const fmt = (r: { _sum: { value: any }; _count: number }) => ({
            count: r._count,
            value: Number(r._sum.value || 0),
        });

        // 6 agregações + 1 lista limitada, todas em paralelo (sem N+1).
        const [atrasadas, hojeVencendo, hojeFila, semana, mes, proximas] =
            await Promise.all([
                sum({ lt: todayStart }),
                sum({ gte: todayStart, lt: tomorrowStart }),
                sum({ lt: todayStart }, { queuedForPaymentAt: { not: null } }),
                sum({ gte: todayStart, lt: weekEnd }),
                sum({ gte: todayStart, lt: monthEnd }),
                this.prisma.bill.findMany({
                    where: open,
                    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
                    take: 10,
                    select: {
                        id: true,
                        description: true,
                        value: true,
                        dueDate: true,
                        status: true,
                        queuedForPaymentAt: true,
                        supplier: { select: { name: true } },
                        category: { select: { name: true } },
                    },
                }),
            ]);

        const vencendo = fmt(hojeVencendo);
        const fila = fmt(hojeFila);

        return {
            referencia: {
                hoje: todayStart.toISOString().slice(0, 10),
                semanaAte: new Date(weekEnd.getTime() - 86400000)
                    .toISOString()
                    .slice(0, 10),
                mesAte: new Date(monthEnd.getTime() - 86400000)
                    .toISOString()
                    .slice(0, 10),
            },
            atrasadas: fmt(atrasadas),
            hoje: {
                count: vencendo.count + fila.count,
                value: vencendo.value + fila.value,
                vencendoHoje: vencendo,
                atrasadasNaFila: fila,
            },
            semana: fmt(semana),
            mes: fmt(mes),
            proximas: proximas.map((bill) => {
                const due = bill.dueDate.toISOString().slice(0, 10);
                const today = todayStart.toISOString().slice(0, 10);

                return {
                    id: bill.id,
                    description: bill.description,
                    value: Number(bill.value),
                    dueDate: bill.dueDate,
                    fornecedor: bill.supplier?.name || null,
                    categoria: bill.category?.name || null,
                    queuedForPaymentAt: bill.queuedForPaymentAt,
                    situacao:
                        due < today
                            ? 'ATRASADA'
                            : due === today
                                ? 'HOJE'
                                : 'A_VENCER',
                };
            }),
        };
    }
}
