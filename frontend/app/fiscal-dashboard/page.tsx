'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Briefcase,
    ChevronLeft,
    ChevronRight,
    FileStack,
    Landmark,
    ReceiptText,
    TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ColumnChart } from '../../src/components/product-sales/charts/ColumnChart';

type Metric = { count: number; value: number };

type TopPerda = { description: string; value: number };

type TopServico = {
    id: string;
    numeroNf: string | null;
    fornecedor: string | null;
    value: number;
    issueDate: string | null;
};

type TopFornecedor = { label: string; value: number };

type Summary = {
    period: { month: number; year: number };
    nfEntrada: Metric;
    nfServico: Metric;
    faturamento: Metric;
    perdas: Metric;
    topPerdas: TopPerda[];
    topServicos: TopServico[];
    topFornecedores: TopFornecedor[];
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatCurrencyCompact(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

function truncar(texto: string, tamanho: number) {
    return texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
}

function monthLabel(month: number, year: number) {
    const date = new Date(year, month - 1, 1);

    const label = date.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });

    return label.charAt(0).toUpperCase() + label.slice(1);
}

function currentMonthYear() {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function FiscalDashboardPage() {
    const [monthYear, setMonthYear] = useState(currentMonthYear());
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/fiscal-dashboard/summary', {
                params: {
                    storeId: store.id,
                    month: monthYear.month,
                    year: monthYear.year,
                },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar o dashboard fiscal.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthYear]);

    function goToPreviousMonth() {
        setMonthYear((current) => {
            const date = new Date(current.year, current.month - 2, 1);
            return { month: date.getMonth() + 1, year: date.getFullYear() };
        });
    }

    function goToNextMonth() {
        setMonthYear((current) => {
            const date = new Date(current.year, current.month, 1);
            return { month: date.getMonth() + 1, year: date.getFullYear() };
        });
    }

    const perdasItens = useMemo(() => {
        if (!summary) return [];

        return summary.topPerdas.map((item) => ({
            label: truncar(item.description, 18),
            value: item.value,
        }));
    }, [summary]);

    const servicosItens = useMemo(() => {
        if (!summary) return [];

        return summary.topServicos.map((service) => ({
            label: truncar(service.fornecedor || 'Sem nome', 18),
            value: service.value,
        }));
    }, [summary]);

    const fornecedoresItens = useMemo(() => {
        if (!summary) return [];

        return summary.topFornecedores.map((fornecedor) => ({
            label: truncar(fornecedor.label, 18),
            value: fornecedor.value,
        }));
    }, [summary]);

    if (!getActiveStore()) {
        return (
            <AppLayout title="Dashboard Fiscal">
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Selecione uma loja ativa no topo do sistema.
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Dashboard Fiscal">
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">
                            Dashboard Fiscal
                        </h2>

                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            NF de entrada, NF de serviço, faturamento e
                            perdas acumulados no mês.
                        </p>
                    </div>

                    <div className="flex items-center gap-1 rounded-xl border border-zinc-200 dark:border-zinc-800 p-1">
                        <button
                            type="button"
                            onClick={goToPreviousMonth}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label="Mês anterior"
                        >
                            <ChevronLeft size={16} />
                        </button>

                        <span className="min-w-[130px] text-center text-sm font-semibold capitalize">
                            {monthLabel(monthYear.month, monthYear.year)}
                        </span>

                        <button
                            type="button"
                            onClick={goToNextMonth}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            aria-label="Próximo mês"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                {loading && !summary ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : (
                    <>
                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <SummaryCard
                                icon={FileStack}
                                label="NF de entrada no mês"
                                value={formatCurrency(
                                    summary?.nfEntrada.value || 0,
                                )}
                                secondary={`${summary?.nfEntrada.count || 0
                                    } nota(s)`}
                                colorClass="text-purple-500"
                            />

                            <SummaryCard
                                icon={Briefcase}
                                label="NF de serviço no mês"
                                value={formatCurrency(
                                    summary?.nfServico.value || 0,
                                )}
                                secondary={`${summary?.nfServico.count || 0
                                    } nota(s)`}
                                colorClass="text-blue-500"
                            />

                            <SummaryCard
                                icon={TrendingUp}
                                label="Faturamento no mês"
                                value={formatCurrency(
                                    summary?.faturamento.value || 0,
                                )}
                                secondary={`${summary?.faturamento.count || 0
                                    } nota(s) de saída`}
                                colorClass="text-blue-500"
                            />

                            <SummaryCard
                                icon={AlertTriangle}
                                label="Perdas no mês"
                                value={formatCurrency(
                                    summary?.perdas.value || 0,
                                )}
                                secondary={`${summary?.perdas.count || 0
                                    } ocorrência(s)`}
                                colorClass="text-red-500"
                                danger
                            />
                        </section>

                        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                            <ChartPanel
                                icon={AlertTriangle}
                                iconColor="text-red-500"
                                title="Itens que mais perderam"
                                emptyMessage="Nenhuma perda com valor cadastrado nesse mês."
                                itens={perdasItens}
                                corDe="#f87171"
                                corPara="#dc2626"
                            />

                            <ChartPanel
                                icon={Briefcase}
                                iconColor="text-blue-500"
                                title="Maiores valores de serviço"
                                emptyMessage="Nenhuma NF de serviço nesse mês."
                                itens={servicosItens}
                                corDe="#60a5fa"
                                corPara="#2563eb"
                            />

                            <ChartPanel
                                icon={Landmark}
                                iconColor="text-purple-500"
                                title="Maiores fornecedores"
                                emptyMessage="Nenhuma NF de entrada nesse mês."
                                itens={fornecedoresItens}
                                corDe="#c084fc"
                                corPara="#7e22ce"
                            />
                        </section>
                    </>
                )}
            </div>
        </AppLayout>
    );
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    secondary,
    colorClass,
    danger = false,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string;
    secondary?: string;
    colorClass: string;
    danger?: boolean;
}) {
    return (
        <div
            className={`rounded-3xl border p-5 ${danger
                ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/[0.06]'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                }`}
        >
            <div className="flex items-center gap-2">
                <Icon size={18} className={colorClass} />
                <p className="text-sm text-zinc-500">{label}</p>
            </div>

            <strong className={`mt-2 block text-2xl ${colorClass}`}>
                {value}
            </strong>

            {secondary && (
                <p className="mt-1 text-xs text-zinc-500">{secondary}</p>
            )}
        </div>
    );
}

function ChartPanel({
    icon: Icon,
    iconColor,
    title,
    emptyMessage,
    itens,
    corDe,
    corPara,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    iconColor: string;
    title: string;
    emptyMessage: string;
    itens: { label: string; value: number }[];
    corDe: string;
    corPara: string;
}) {
    return (
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <div className="mb-4 flex items-center gap-2">
                <Icon size={18} className={iconColor} />
                <h3 className="text-sm font-semibold">{title}</h3>
            </div>

            {itens.length === 0 ? (
                <p className="flex h-56 items-center justify-center text-center text-sm text-zinc-400">
                    {emptyMessage}
                </p>
            ) : (
                <>
                    <ColumnChart
                        itens={itens}
                        corDe={corDe}
                        corPara={corPara}
                        formatarValor={formatCurrencyCompact}
                    />

                    <ul className="mt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                        {itens.map((item) => (
                            <li
                                key={item.label}
                                className="flex items-center justify-between gap-3 text-sm"
                            >
                                <span className="flex min-w-0 items-center gap-2 truncate">
                                    <ReceiptText
                                        size={13}
                                        className="shrink-0 text-zinc-400"
                                    />
                                    {item.label}
                                </span>

                                <span className="shrink-0 font-semibold">
                                    {formatCurrency(item.value)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
