import { BadRequestException, Injectable } from '@nestjs/common';
import { PurchaseStatus, TaxRegimeType } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { TaxConfigService, monthEndDate, monthToDate } from './tax-config.service';
import { RevenueService } from './revenue.service';
import {
    calculateLucroPresumido,
    calculateLucroReal,
    calculateSimplesNacional,
} from './tax-calculator';

// Mesmo critério usado na tela de Cupons e NF pra considerar uma compra
// "real" (não incluir rascunho, rejeitada ou cancelada no custo).
const EXCLUDED_PURCHASE_STATUSES: PurchaseStatus[] = [
    PurchaseStatus.DRAFT,
    PurchaseStatus.REJECTED,
    PurchaseStatus.CANCELED,
];

@Injectable()
export class TaxCalculationService {
    constructor(
        private prisma: PrismaService,
        private taxConfigService: TaxConfigService,
        private revenueService: RevenueService,
    ) { }

    async calculate(storeId: string, referenceMonth: string, user: any) {
        const { config, monthRevenue, get } = await this.loadContext(
            storeId,
            referenceMonth,
            user,
        );

        if (config.regime === TaxRegimeType.SIMPLES) {
            const { rbt12, result } = await get.simples();

            return {
                regime: TaxRegimeType.SIMPLES,
                referenceMonth,
                monthRevenue,
                rbt12,
                simples: result,
                total: result.dasValue,
                configId: config.id,
            };
        }

        if (config.regime === TaxRegimeType.PRESUMIDO) {
            const { monthPurchasesCost, monthCostBreakdown, result } =
                await get.presumido();

            return {
                regime: TaxRegimeType.PRESUMIDO,
                referenceMonth,
                monthRevenue,
                monthPurchasesCost,
                monthCostBreakdown,
                presumido: result,
                total: result.total,
                configId: config.id,
            };
        }

        const { monthPurchasesCost, monthCostBreakdown, result } = await get.real();

        return {
            regime: TaxRegimeType.REAL,
            referenceMonth,
            monthRevenue,
            monthPurchasesCost,
            monthCostBreakdown,
            real: result,
            total: result.total,
            configId: config.id,
        };
    }

    // Calcula os 3 regimes lado a lado pra comparação — "o que eu pagaria
    // se estivesse em cada regime", usando o mesmo faturamento/compras do
    // mês. É a base do gráfico "onde dá pra reduzir" no dashboard: pra
    // Simples e Presumido o imposto é sobre a receita (custo não reduz
    // nada), então a alavanca real costuma ser a escolha do regime, não o
    // corte de despesas.
    async compareRegimes(storeId: string, referenceMonth: string, user: any) {
        const { config, monthRevenue, get } = await this.loadContext(
            storeId,
            referenceMonth,
            user,
        );

        const { rbt12, result: simples } = await get.simples();
        const { result: presumido } = await get.presumido();
        const { monthPurchasesCost, monthCostBreakdown, result: real } =
            await get.real();

        return {
            referenceMonth,
            monthRevenue,
            monthPurchasesCost,
            monthCostBreakdown,
            rbt12,
            currentRegime: config.regime,
            simples: { total: simples.dasValue, elegivel: !simples.excedeuLimite, detail: simples },
            presumido: { total: presumido.total, detail: presumido },
            real: { total: real.total, detail: real },
        };
    }

    // Reúne tudo que os cálculos precisam (config vigente, faturamento do
    // mês) uma única vez, e devolve funções "get.simples()/presumido()/
    // real()" que fazem a conta sob demanda — assim calculate() só roda o
    // regime ativo, e compareRegimes() roda os 3, sem duplicar a busca de
    // config/faturamento/compras/RBT12.
    private async loadContext(storeId: string, referenceMonth: string, user: any) {
        const config = await this.taxConfigService.findEffective(
            storeId,
            referenceMonth,
            user,
        );

        if (!config) {
            throw new BadRequestException(
                'Nenhuma configuração de regime tributário vigente pra essa loja nesse mês. Cadastre em Tributos → Configuração.',
            );
        }

        const revenueEntry = await this.prisma.revenueEntry.findUnique({
            where: { storeId_referenceMonth: { storeId, referenceMonth } },
        });

        if (!revenueEntry) {
            throw new BadRequestException(
                'Nenhum faturamento lançado pra esse mês. Lance em Tributos → Faturamentos antes de calcular.',
            );
        }

        const monthRevenue = Number(revenueEntry.grossRevenue);

        const icmsConfig = {
            icmsRegimeEspecialMg: config.icmsRegimeEspecialMg,
            icmsAliquotaRefeicao: config.icmsAliquotaRefeicao
                ? Number(config.icmsAliquotaRefeicao)
                : null,
            icmsAliquotaOutras: config.icmsAliquotaOutras
                ? Number(config.icmsAliquotaOutras)
                : null,
            icmsAliquotaPadrao: config.icmsAliquotaPadrao
                ? Number(config.icmsAliquotaPadrao)
                : null,
        };

        let rbt12Cache: number | null = null;
        let costCache: MonthCostBreakdown | null = null;

        const getMonthCost = async () => {
            if (costCache === null) {
                costCache = await this.getMonthCost(storeId, referenceMonth);
            }

            return costCache;
        };

        return {
            config,
            monthRevenue,
            get: {
                simples: async () => {
                    if (rbt12Cache === null) {
                        const { total } = await this.revenueService.getRbt12(
                            storeId,
                            referenceMonth,
                            user,
                        );
                        rbt12Cache = total;
                    }

                    return {
                        rbt12: rbt12Cache,
                        result: calculateSimplesNacional(rbt12Cache, monthRevenue),
                    };
                },
                // Presumido também recebe o custo do mês: o IRPJ/CSLL (base
                // presumida) não usa isso, mas o crédito de ICMS (quando a
                // loja não está no regime especial MG) depende do custo do
                // mês, igual no Real. O custo soma Compras cadastradas + NF
                // de Entrada ainda não vinculada a nenhuma compra (pra não
                // perder crédito de quem só sincronizou/importou a NF e
                // ainda não conciliou) + Serviços contratados no mês.
                presumido: async () => {
                    const cost = await getMonthCost();

                    return {
                        monthPurchasesCost: cost.total,
                        monthCostBreakdown: cost,
                        result: calculateLucroPresumido(
                            {
                                presumidoIrpjPercent: Number(
                                    config.presumidoIrpjPercent || 8,
                                ),
                                presumidoCsllPercent: Number(
                                    config.presumidoCsllPercent || 12,
                                ),
                                presumidoPisCofinsPercent: Number(
                                    config.presumidoPisCofinsPercent || 3.65,
                                ),
                                ...icmsConfig,
                            },
                            monthRevenue,
                            cost.total,
                        ),
                    };
                },
                real: async () => {
                    const cost = await getMonthCost();

                    return {
                        monthPurchasesCost: cost.total,
                        monthCostBreakdown: cost,
                        result: calculateLucroReal(
                            {
                                realPisCofinsPercent: Number(
                                    config.realPisCofinsPercent || 9.25,
                                ),
                                ...icmsConfig,
                            },
                            monthRevenue,
                            cost.total,
                        ),
                    };
                },
            },
        };
    }

    // Custo do mês pra fins de crédito de ICMS/PIS-COFINS e base do Lucro
    // Real: soma três fontes, sem duplicar quem já foi conciliado.
    // 1) Compras cadastradas no mês (purchasedAt, caindo pra createdAt sem
    //    data) — mesma regra da tela de Cupons e NF, ignora rascunho,
    //    rejeitada e cancelada.
    // 2) NF de Entrada (Sefaz ou XML importado) que ainda NÃO foi vinculada
    //    a nenhuma Compra cadastrada — sem isso, quem só sincroniza a NF e
    //    esquece de conciliar perdia o crédito de imposto daquela compra.
    //    As que já têm purchaseId ficam de fora daqui pra não contar duas
    //    vezes (o valor delas já está em (1) via a Compra vinculada).
    // 3) Serviços contratados no mês — despesa dedutível igual compra de
    //    mercadoria, mas que não passava pelo cálculo antes.
    private async getMonthCost(
        storeId: string,
        referenceMonth: string,
    ): Promise<MonthCostBreakdown> {
        const monthStart = monthToDate(referenceMonth);
        const monthEnd = monthEndDate(referenceMonth);

        const [purchases, unlinkedIncomingNfs, services] = await Promise.all([
            this.prisma.purchase.findMany({
                where: {
                    storeId,
                    status: { notIn: EXCLUDED_PURCHASE_STATUSES },
                    OR: [
                        { purchasedAt: { gte: monthStart, lte: monthEnd } },
                        {
                            purchasedAt: null,
                            createdAt: { gte: monthStart, lte: monthEnd },
                        },
                    ],
                },
                select: { value: true },
            }),
            this.prisma.incomingGoodsNf.findMany({
                where: {
                    storeId,
                    purchaseId: null,
                    ignored: false,
                    OR: [
                        { issueDate: { gte: monthStart, lte: monthEnd } },
                        {
                            issueDate: null,
                            fetchedAt: { gte: monthStart, lte: monthEnd },
                        },
                    ],
                },
                select: { value: true },
            }),
            this.prisma.service.findMany({
                where: {
                    storeId,
                    serviceDate: { gte: monthStart, lte: monthEnd },
                },
                select: { value: true },
            }),
        ]);

        const purchasesCost = purchases.reduce(
            (sum, p) => sum + Number(p.value),
            0,
        );
        const unlinkedIncomingNfCost = unlinkedIncomingNfs.reduce(
            (sum, nf) => sum + Number(nf.value || 0),
            0,
        );
        const servicesCost = services.reduce(
            (sum, s) => sum + Number(s.value),
            0,
        );

        return {
            total: purchasesCost + unlinkedIncomingNfCost + servicesCost,
            purchases: purchasesCost,
            unlinkedIncomingNf: unlinkedIncomingNfCost,
            services: servicesCost,
        };
    }
}

export type MonthCostBreakdown = {
    total: number;
    purchases: number;
    unlinkedIncomingNf: number;
    services: number;
};
