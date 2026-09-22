'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    BarChart3,
    Calendar,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    PieChart,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ColumnChart } from '../../src/components/product-sales/charts/ColumnChart';
import { DonutChart } from '../../src/components/product-sales/charts/DonutChart';

type Bucket = {
    pagas: { count: number; value: number };
    aPagar: { count: number; value: number };
};

type Pagamentos = {
    hoje: Bucket;
    semana: Bucket;
    mes: Bucket;
    vencidas: { count: number; value: number };
};

type TopPagamento = {
    id: string;
    description: string;
    value: number;
    paidAt: string | null;
    categoria: string | null;
    fornecedor: string | null;
};

type Summary = {
    period: { month: number; year: number };
    pagamentos: Pagamentos;
    totalMes: { count: number; value: number };
    topPagamentos: TopPagamento[];
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

export default function FinancialDashboardPage() {
    const router = useRouter();
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

            const response = await api.get('/financial-dashboard/summary', {
                params: {
                    storeId: store.id,
                    month: monthYear.month,
                    year: monthYear.year,
                },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar o dashboard financeiro.');
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

    const columnItens = useMemo(() => {
        if (!summary) return [];

        return summary.topPagamentos.map((bill) => ({
            label: truncar(bill.description, 18),
            value: bill.value,
        }));
    }, [summary]);

    const mesDonutItens = useMemo(() => {
        if (!summary) return [];

        return [
            {
                label: 'Pagas',
                value: summary.pagamentos.mes.pagas.value,
                cor: '#10b981',
            },
            {
                label: 'A pagar',
                value: summary.pagamentos.mes.aPagar.value,
                cor: '#f59e0b',
            },
        ].filter((item) => item.value > 0);
    }, [summary]);

    if (!getActiveStore()) {
        return (
            <AppLayout title="Dashboard Financeiro">
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Selecione uma loja ativa no topo do sistema.
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Dashboard Financeiro">
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold">
                        Dashboard Financeiro
                    </h2>

                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Visão geral de Contas a Pagar — pagas e a pagar, por
                        período.
                    </p>
                </div>

                {loading && !summary ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : (
                    <>
                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Wallet size={18} className="text-cyan-500" />
                                <h3 className="text-sm font-semibold">
                                    Total de contas este mês
                                </h3>
                            </div>

                            <div className="flex flex-wrap items-end justify-between gap-4">
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push('/bills?period=MES')
                                    }
                                    className="text-left transition hover:opacity-80"
                                >
                                    <strong className="text-3xl">
                                        {formatCurrency(
                                            summary?.totalMes.value || 0,
                                        )}
                                    </strong>
                                    <p className="mt-1 text-sm text-zinc-500">
                                        {summary?.totalMes.count || 0} conta(s)
                                        no total, entre pagas e a pagar —
                                        clique para ver
                                    </p>
                                </button>

                                <div className="flex gap-4 text-sm">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                '/bills?period=MES&paid=PAGAS',
                                            )
                                        }
                                        className="flex items-center gap-1.5 text-emerald-500 hover:underline"
                                    >
                                        <CheckCircle2 size={15} />
                                        Pagas:{' '}
                                        {formatCurrency(
                                            summary?.pagamentos.mes.pagas
                                                .value || 0,
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                '/bills?period=MES&paid=APAGAR',
                                            )
                                        }
                                        className="flex items-center gap-1.5 text-amber-500 hover:underline"
                                    >
                                        <Clock size={15} />
                                        A pagar:{' '}
                                        {formatCurrency(
                                            summary?.pagamentos.mes.aPagar
                                                .value || 0,
                                        )}
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                                Pagamentos por período (vencimento) — pagas x
                                a pagar
                            </h3>

                            <div className="space-y-3">
                                <PeriodRow
                                    icon={Clock}
                                    label="Hoje"
                                    bucket={summary?.pagamentos.hoje}
                                    onPagasClick={() =>
                                        router.push(
                                            '/bills?period=HOJE&paid=PAGAS',
                                        )
                                    }
                                    onAPagarClick={() =>
                                        router.push(
                                            '/bills?period=HOJE&paid=APAGAR',
                                        )
                                    }
                                />

                                <PeriodRow
                                    icon={CalendarDays}
                                    label="Essa semana"
                                    bucket={summary?.pagamentos.semana}
                                    onPagasClick={() =>
                                        router.push(
                                            '/bills?period=SEMANA&paid=PAGAS',
                                        )
                                    }
                                    onAPagarClick={() =>
                                        router.push(
                                            '/bills?period=SEMANA&paid=APAGAR',
                                        )
                                    }
                                />

                                <PeriodRow
                                    icon={Calendar}
                                    label="Este mês"
                                    bucket={summary?.pagamentos.mes}
                                    onPagasClick={() =>
                                        router.push(
                                            '/bills?period=MES&paid=PAGAS',
                                        )
                                    }
                                    onAPagarClick={() =>
                                        router.push(
                                            '/bills?period=MES&paid=APAGAR',
                                        )
                                    }
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push('/bills?period=VENCIDAS')
                                    }
                                    className="flex w-full items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-left transition hover:bg-red-500/10 dark:bg-red-500/[0.06]"
                                >
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle
                                            size={18}
                                            className="text-red-500"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold text-red-500">
                                                Vencidas
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                Ainda não pagas e com
                                                vencimento no passado
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <strong className="text-lg text-red-500">
                                            {formatCurrency(
                                                summary?.pagamentos.vencidas
                                                    .value || 0,
                                            )}
                                        </strong>
                                        <p className="text-xs text-zinc-500">
                                            {summary?.pagamentos.vencidas
                                                .count || 0}{' '}
                                            conta(s)
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </section>

                        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2">
                                        <BarChart3
                                            size={18}
                                            className="text-emerald-500"
                                        />
                                        <h3 className="text-sm font-semibold">
                                            Top 5 maiores pagamentos
                                        </h3>
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

                                        <span className="min-w-[130px] text-center text-xs font-semibold capitalize">
                                            {monthLabel(
                                                monthYear.month,
                                                monthYear.year,
                                            )}
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

                                {columnItens.length === 0 ? (
                                    <p className="flex h-56 items-center justify-center text-sm text-zinc-400">
                                        Nenhum pagamento nesse mês.
                                    </p>
                                ) : (
                                    <>
                                        <ColumnChart
                                            itens={columnItens}
                                            corDe="#10b981"
                                            corPara="#059669"
                                            formatarValor={
                                                formatCurrencyCompact
                                            }
                                        />

                                        <ul className="mt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                            {summary?.topPagamentos.map(
                                                (bill) => (
                                                    <li key={bill.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                router.push(
                                                                    `/bills?billId=${bill.id}`,
                                                                )
                                                            }
                                                            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left text-sm transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="truncate font-medium">
                                                                    {bill.description}
                                                                </p>
                                                                <p className="text-xs text-zinc-500">
                                                                    {bill.fornecedor ||
                                                                        bill.categoria ||
                                                                        'Sem categoria'}
                                                                </p>
                                                            </div>

                                                            <span className="shrink-0 font-semibold text-emerald-500">
                                                                {formatCurrency(
                                                                    bill.value,
                                                                )}
                                                            </span>
                                                        </button>
                                                    </li>
                                                ),
                                            )}
                                        </ul>
                                    </>
                                )}
                            </div>

                            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                                <div className="mb-4 flex items-center gap-2">
                                    <PieChart
                                        size={18}
                                        className="text-cyan-500"
                                    />
                                    <h3 className="text-sm font-semibold">
                                        Este mês: pagas x a pagar
                                    </h3>
                                </div>

                                {mesDonutItens.length === 0 ? (
                                    <p className="flex h-56 items-center justify-center text-sm text-zinc-400">
                                        Nenhuma conta com vencimento esse mês.
                                    </p>
                                ) : (
                                    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                                        <DonutChart
                                            itens={mesDonutItens}
                                            centro={{
                                                titulo: 'Total',
                                                valor: formatCurrencyCompact(
                                                    summary?.totalMes.value ||
                                                    0,
                                                ),
                                            }}
                                        />

                                        <ul className="w-full space-y-2">
                                            {mesDonutItens.map((item) => (
                                                <li
                                                    key={item.label}
                                                    className="flex items-center justify-between gap-3 text-sm"
                                                >
                                                    <span className="flex items-center gap-2 truncate">
                                                        <span
                                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                            style={{
                                                                background:
                                                                    item.cor,
                                                            }}
                                                        />
                                                        {item.label}
                                                    </span>

                                                    <span className="shrink-0 font-semibold">
                                                        {formatCurrency(
                                                            item.value,
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </AppLayout>
    );
}

function PeriodRow({
    icon: Icon,
    label,
    bucket,
    onPagasClick,
    onAPagarClick,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    bucket?: Bucket;
    onPagasClick: () => void;
    onAPagarClick: () => void;
}) {
    const pagas = bucket?.pagas || { count: 0, value: 0 };
    const aPagar = bucket?.aPagar || { count: 0, value: 0 };
    const total = pagas.value + aPagar.value;
    const totalCount = pagas.count + aPagar.count;

    return (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                    <Icon size={16} className="text-zinc-500" />
                    {label}
                </span>

                <span className="text-xs text-zinc-500">
                    {totalCount} conta(s) · total {formatCurrency(total)}
                </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={onPagasClick}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-left transition hover:bg-emerald-500/10 dark:bg-emerald-500/[0.06]"
                >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                        <CheckCircle2 size={13} />
                        Pagas
                    </p>
                    <strong className="mt-1 block text-lg">
                        {formatCurrency(pagas.value)}
                    </strong>
                    <p className="text-xs text-zinc-500">
                        {pagas.count} conta(s)
                    </p>
                </button>

                <button
                    type="button"
                    onClick={onAPagarClick}
                    className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-left transition hover:bg-amber-500/10 dark:bg-amber-500/[0.06]"
                >
                    <p className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
                        <Clock size={13} />
                        A pagar
                    </p>
                    <strong className="mt-1 block text-lg">
                        {formatCurrency(aPagar.value)}
                    </strong>
                    <p className="text-xs text-zinc-500">
                        {aPagar.count} conta(s)
                    </p>
                </button>
            </div>
        </div>
    );
}
