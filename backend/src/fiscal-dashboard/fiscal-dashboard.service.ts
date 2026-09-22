import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Dashboard Fiscal — visão geral do mês em NF de entrada, NF de serviço,
// faturamento (NF de saída importada) e perdas, mais os rankings (itens
// mais perdidos, maiores notas de serviço, maiores fornecedores). Tudo
// segue o mesmo mês navegável do topo da tela — diferente do Dashboard
// Financeiro, aqui não existe a distinção "ao vivo x histórico" porque
// nenhum desses números muda de status ao longo do dia (não são contas
// que ficam vencendo, são documentos já emitidos).
@Injectable()
export class FiscalDashboardService {
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

    private monthRange(month: number, year: number) {
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 1);

        return { gte: start, lt: end };
    }

    private referenceMonth(month: number, year: number) {
        return `${year}-${String(month).padStart(2, '0')}`;
    }

    async summary(
        user: any,
        filters: { storeId: string; month: number; year: number },
    ) {
        this.ensureStoreAccess(filters.storeId, user);

        const { storeId } = filters;
        const range = this.monthRange(filters.month, filters.year);
        const referenceMonth = this.referenceMonth(
            filters.month,
            filters.year,
        );

        const [
            nfEntrada,
            nfServico,
            faturamento,
            perdas,
            topServicos,
            fornecedoresRows,
        ] = await Promise.all([
            this.prisma.incomingGoodsNf.aggregate({
                where: { storeId, ignored: false, issueDate: range },
                _sum: { value: true },
                _count: true,
            }),
            this.prisma.incomingServiceNf.aggregate({
                where: { storeId, ignored: false, issueDate: range },
                _sum: { value: true },
                _count: true,
            }),
            this.prisma.outgoingSalesNf.aggregate({
                where: { storeId, ignored: false, referenceMonth },
                _sum: { value: true },
                _count: true,
            }),
            this.prisma.productLoss.findMany({
                where: { storeId, occurredAt: range },
                select: { description: true, quantity: true, unitValue: true },
            }),
            this.prisma.incomingServiceNf.findMany({
                where: {
                    storeId,
                    ignored: false,
                    issueDate: range,
                    value: { not: null },
                },
                orderBy: { value: 'desc' },
                take: 5,
                select: {
                    id: true,
                    numeroNf: true,
                    issuerName: true,
                    value: true,
                    issueDate: true,
                },
            }),
            this.prisma.incomingGoodsNf.findMany({
                where: {
                    storeId,
                    ignored: false,
                    issueDate: range,
                    value: { not: null },
                },
                select: {
                    issuerCnpj: true,
                    issuerName: true,
                    value: true,
                },
            }),
        ]);

        // Perda sem valor unitário cadastrado entra na contagem (pra não
        // esconder que aconteceu) mas não no total em R$ nem no ranking por
        // item — mesma regra já usada no relatório mensal de Perdas.
        const perdasValue = perdas.reduce((total, loss) => {
            if (loss.unitValue === null) return total;
            return total + Number(loss.unitValue) * Number(loss.quantity);
        }, 0);

        const topPerdasMap = new Map<string, number>();

        for (const loss of perdas) {
            if (loss.unitValue === null) continue;

            const value = Number(loss.unitValue) * Number(loss.quantity);
            const current = topPerdasMap.get(loss.description) || 0;
            topPerdasMap.set(loss.description, current + value);
        }

        const topPerdas = [...topPerdasMap.entries()]
            .map(([description, value]) => ({ description, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        const fornecedoresMap = new Map<
            string,
            { label: string; value: number }
        >();

        for (const row of fornecedoresRows) {
            if (row.value === null) continue;

            const key = row.issuerCnpj || row.issuerName || 'não identificado';
            const label = row.issuerName || row.issuerCnpj || 'Não identificado';
            const current = fornecedoresMap.get(key);

            fornecedoresMap.set(key, {
                label,
                value: (current?.value || 0) + Number(row.value),
            });
        }

        const topFornecedores = [...fornecedoresMap.values()]
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        return {
            period: { month: filters.month, year: filters.year },
            nfEntrada: {
                count: nfEntrada._count,
                value: Number(nfEntrada._sum.value || 0),
            },
            nfServico: {
                count: nfServico._count,
                value: Number(nfServico._sum.value || 0),
            },
            faturamento: {
                count: faturamento._count,
                value: Number(faturamento._sum.value || 0),
            },
            perdas: {
                count: perdas.length,
                value: perdasValue,
            },
            topPerdas,
            topServicos: topServicos.map((service) => ({
                id: service.id,
                numeroNf: service.numeroNf,
                fornecedor: service.issuerName,
                value: Number(service.value),
                issueDate: service.issueDate,
            })),
            topFornecedores,
        };
    }
}
