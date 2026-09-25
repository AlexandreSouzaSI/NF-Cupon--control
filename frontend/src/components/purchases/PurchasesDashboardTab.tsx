'use client';

import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Receipt,
    Truck,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ColumnChart } from '../product-sales/charts/ColumnChart';
import { DonutChart } from '../product-sales/charts/DonutChart';

type TopSupplier = {
    name: string;
    value: number;
};

type TopProduct = {
    name: string;
    quantity: number;
};

type DashboardSummary = {
    referenceMonth: string;
    pipeline: {
        arriving: number;
        ok: number;
        difference: number;
    };
    period: {
        totalCount: number;
        totalValue: number;
    };
    topSuppliers: TopSupplier[];
    topProducts: TopProduct[];
};

// Mesmas cores usadas no gráfico de participação de Produtos, só que aqui
// representando os fornecedores com maior valor comprado no período.
const CORES_PIZZA = [
    '#10b981',
    '#3b82f6',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
    '#6366f1',
];

function formatarNumero(valor: number) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function truncar(texto: string, tamanho: number) {
    return texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
}

function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(value: string, delta: number) {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(value: string) {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const label = date.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function PurchasesDashboardTab({
    onSelectStage,
}: {
    // Clicar num card do pipeline volta pra Lista já filtrada naquela aba
    // — "A chegar" inclui pedido com fornecedor e compra online juntos,
    // enquanto nenhum dos dois tiver sido recebido.
    onSelectStage: (stage: 'ARRIVING' | 'OK' | 'DIFFERENCE') => void;
}) {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());

    async function load() {
        try {
            setLoading(true);

            const response = await api.get('/purchases/dashboard-summary', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    month: selectedMonth,
                },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar o dashboard de compras.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth]);

    const monthSelector = (
        <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1">
            <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Mês anterior"
            >
                <ChevronLeft size={18} />
            </button>

            <label className="relative flex h-9 min-w-[9.5rem] cursor-pointer items-center justify-center rounded-xl px-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {formatMonthLabel(selectedMonth)}
                <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) =>
                        e.target.value && setSelectedMonth(e.target.value)
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </label>

            <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Próximo mês"
            >
                <ChevronRight size={18} />
            </button>

            {selectedMonth !== currentMonthValue() && (
                <button
                    type="button"
                    onClick={() => setSelectedMonth(currentMonthValue())}
                    className="ml-1 h-9 rounded-xl px-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                >
                    Hoje
                </button>
            )}
        </div>
    );

    if (loading && !summary) {
        return (
            <div className="space-y-4">
                {monthSelector}
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando dashboard de compras...
                </p>
            </div>
        );
    }

    if (!summary) {
        return (
            <div className="space-y-4">
                {monthSelector}

                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Não foi possível carregar o dashboard.
                    </p>

                    <button
                        type="button"
                        onClick={load}
                        className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                    >
                        Tentar novamente
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold">Visão geral</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Pipeline atual da loja ativa + total comprado no mês
                        selecionado.
                    </p>
                </div>

                {monthSelector}
            </div>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <button
                    type="button"
                    onClick={() => onSelectStage('ARRIVING')}
                    className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-5 text-left transition hover:border-amber-500/40"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="rounded-2xl bg-amber-500/20 p-3 text-amber-500">
                            <Truck size={22} />
                        </div>
                    </div>

                    <strong className="block text-3xl text-amber-500">
                        {summary.pipeline.arriving}
                    </strong>

                    <p className="mt-2 font-medium">A chegar</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        Pedido com fornecedor + compra online, aguardando
                        recebimento
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectStage('OK')}
                    className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5 text-left transition hover:border-blue-500/40"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="rounded-2xl bg-blue-500/20 p-3 text-blue-500">
                            <CheckCircle2 size={22} />
                        </div>
                    </div>

                    <strong className="block text-3xl text-blue-500">
                        {summary.pipeline.ok}
                    </strong>

                    <p className="mt-2 font-medium">Chegou</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        Recebidas sem divergência
                    </p>
                </button>

                <button
                    type="button"
                    onClick={() => onSelectStage('DIFFERENCE')}
                    className="rounded-3xl border border-red-500/20 bg-red-500/10 p-5 text-left transition hover:border-red-500/40"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="rounded-2xl bg-red-500/20 p-3 text-red-500">
                            <AlertTriangle size={22} />
                        </div>
                    </div>

                    <strong className="block text-3xl text-red-500">
                        {summary.pipeline.difference}
                    </strong>

                    <p className="mt-2 font-medium">Chegou com diferença</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        Recebimento não bateu com o pedido
                    </p>
                </button>

                <div className="rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="rounded-2xl bg-blue-500/20 p-3 text-blue-500">
                            <Receipt size={22} />
                        </div>
                    </div>

                    <strong className="block text-3xl text-blue-500">
                        {formatCurrency(summary.period.totalValue)}
                    </strong>

                    <p className="mt-2 font-medium">Total do período</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        {summary.period.totalCount} compra(s) cadastrada(s)
                        em {formatMonthLabel(selectedMonth)}
                    </p>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-4">
                        <p className="font-bold text-zinc-900 dark:text-white">
                            Top fornecedores
                        </p>
                        <p className="text-xs text-zinc-500">
                            Maior valor comprado em {formatMonthLabel(selectedMonth)}
                        </p>
                    </div>

                    {summary.topSuppliers.length === 0 ? (
                        <p className="py-10 text-center text-sm text-zinc-500">
                            Nenhuma compra no período.
                        </p>
                    ) : (
                        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
                            <DonutChart
                                itens={summary.topSuppliers.map((supplier, index) => ({
                                    label: supplier.name,
                                    value: supplier.value,
                                    cor: CORES_PIZZA[index % CORES_PIZZA.length],
                                }))}
                                centro={{
                                    titulo: 'Total',
                                    valor: formatCurrency(
                                        summary.topSuppliers.reduce(
                                            (acc, supplier) => acc + supplier.value,
                                            0,
                                        ),
                                    ),
                                }}
                            />

                            <div className="w-full max-w-sm space-y-1.5">
                                {summary.topSuppliers.map((supplier, index) => {
                                    const total = summary.topSuppliers.reduce(
                                        (acc, item) => acc + item.value,
                                        0,
                                    );
                                    const pct = total > 0 ? (supplier.value / total) * 100 : 0;

                                    return (
                                        <div
                                            key={supplier.name}
                                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            CORES_PIZZA[index % CORES_PIZZA.length],
                                                    }}
                                                />
                                                <span className="truncate text-zinc-700 dark:text-zinc-300">
                                                    {supplier.name}
                                                </span>
                                            </div>
                                            <span className="shrink-0 font-semibold text-zinc-900 dark:text-white">
                                                {pct.toLocaleString('pt-BR', {
                                                    maximumFractionDigits: 1,
                                                })}
                                                %
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-4">
                        <p className="font-bold text-zinc-900 dark:text-white">
                            Produtos mais comprados
                        </p>
                        <p className="text-xs text-zinc-500">
                            Maior quantidade pedida em {formatMonthLabel(selectedMonth)}
                        </p>
                    </div>

                    {summary.topProducts.length === 0 ? (
                        <p className="py-10 text-center text-sm text-zinc-500">
                            Nenhum item de compra no período.
                        </p>
                    ) : (
                        <ColumnChart
                            itens={summary.topProducts.map((product) => ({
                                label: truncar(product.name, 16),
                                value: product.quantity,
                            }))}
                            corDe="#34d399"
                            corPara="#059669"
                            formatarValor={formatarNumero}
                            ordem="desc"
                        />
                    )}
                </div>
            </section>
        </div>
    );
}
