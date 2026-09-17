'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    BarChart3,
    Package,
    PieChart,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';

import { ColumnChart } from './charts/ColumnChart';
import { DonutChart } from './charts/DonutChart';

type ProductSummaryItem = {
    produto: string;
    produtoChave: string;
    categoria: string;
    quantidade: number;
    valor: number;
    ticketMedio: number;
    temReceita: boolean;
};

type ProductSummary = {
    totalProdutos: number;
    totalQuantidade: number;
    totalValor: number;
    produtos: ProductSummaryItem[];
};

type Metrica = 'quantidade' | 'valor';

const CORES_PIZZA = [
    '#10b981',
    '#3b82f6',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#f97316',
    '#6366f1',
    '#14b8a6',
    '#ef4444',
];

const COR_OUTROS = '#a1a1aa';

function formatarMoeda(valor: number) {
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

function formatarNumero(valor: number) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function truncar(texto: string, tamanho: number) {
    return texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
}

export function DashboardTab({
    refreshKey,
    importId,
}: {
    refreshKey?: number;
    importId?: string | null;
}) {
    const [summary, setSummary] = useState<ProductSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [metrica, setMetrica] = useState<Metrica>('quantidade');

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);

            const response = await api.get('/product-sales/summary', {
                params: { storeId: store.id, importId: importId || undefined },
            });

            setSummary(response.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, importId]);

    const formatarValor = metrica === 'quantidade' ? formatarNumero : formatarMoeda;

    const ordenados = useMemo(() => {
        if (!summary) return [];
        return [...summary.produtos].sort((a, b) => b[metrica] - a[metrica]);
    }, [summary, metrica]);

    const maisVendidos = useMemo(() => ordenados.slice(0, 10), [ordenados]);

    const menosVendidos = useMemo(() => {
        // Evita repetir produto quando a loja tem poucos itens cadastrados
        // (top 10 e bottom 10 se sobrepondo).
        const restantes = ordenados.slice(10);
        const base = restantes.length > 0 ? restantes : ordenados;
        return [...base].sort((a, b) => a[metrica] - b[metrica]).slice(0, 10);
    }, [ordenados, metrica]);

    const fatiasPizza = useMemo(() => {
        const totalGeral = ordenados.reduce((acc, item) => acc + item[metrica], 0);
        if (totalGeral <= 0) return [];

        const top = maisVendidos.map((item, index) => ({
            label: item.produto,
            value: item[metrica],
            cor: CORES_PIZZA[index % CORES_PIZZA.length],
        }));

        const somaTop = top.reduce((acc, item) => acc + item.value, 0);
        const outros = totalGeral - somaTop;

        if (outros > 0) {
            top.push({ label: 'Outros produtos', value: outros, cor: COR_OUTROS });
        }

        return top;
    }, [maisVendidos, ordenados, metrica]);

    const totalPizza = fatiasPizza.reduce((acc, item) => acc + item.value, 0);

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                            <Package size={18} />
                        </div>
                        <p className="text-xs text-zinc-500">Produtos distintos</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                            {loading ? '...' : summary?.totalProdutos ?? 0}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                            <TrendingUp size={18} />
                        </div>
                        <p className="text-xs text-zinc-500">Quantidade vendida (total)</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                            {loading ? '...' : formatarNumero(summary?.totalQuantidade ?? 0)}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <TrendingUp size={18} />
                        </div>
                        <p className="text-xs text-zinc-500">Valor vendido (total)</p>
                        <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                            {loading ? '...' : formatarMoeda(summary?.totalValor ?? 0)}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-end gap-2">
                <span className="text-xs text-zinc-500">Ranquear por:</span>
                <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
                    <button
                        onClick={() => setMetrica('quantidade')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${metrica === 'quantidade'
                                ? 'bg-emerald-600 text-white'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                            }`}
                    >
                        Quantidade
                    </button>
                    <button
                        onClick={() => setMetrica('valor')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${metrica === 'valor'
                                ? 'bg-emerald-600 text-white'
                                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
                            }`}
                    >
                        Valor (R$)
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : !summary || summary.produtos.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum produto encontrado — importe uma planilha na aba
                    &quot;Importar&quot;.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <BarChart3 size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-zinc-900 dark:text-white">
                                        Mais vendidos
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        Top 10 por {metrica === 'quantidade' ? 'quantidade' : 'valor'}
                                    </p>
                                </div>
                            </div>

                            <ColumnChart
                                itens={maisVendidos.map((p) => ({
                                    label: truncar(p.produto, 16),
                                    value: p[metrica],
                                }))}
                                corDe="#34d399"
                                corPara="#059669"
                                formatarValor={formatarValor}
                                ordem="desc"
                            />
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                                    <TrendingDown size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-zinc-900 dark:text-white">
                                        Menos vendidos
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        Bottom 10 por{' '}
                                        {metrica === 'quantidade' ? 'quantidade' : 'valor'}
                                    </p>
                                </div>
                            </div>

                            <ColumnChart
                                itens={menosVendidos.map((p) => ({
                                    label: truncar(p.produto, 16),
                                    value: p[metrica],
                                }))}
                                corDe="#fbbf24"
                                corPara="#dc2626"
                                formatarValor={formatarValor}
                                ordem="asc"
                            />
                        </div>
                    </div>

                    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                        <div className="mb-5 flex items-center gap-2">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500">
                                <PieChart size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    Participação dos mais vendidos
                                </p>
                                <p className="text-xs text-zinc-500">
                                    Quanto os 10 produtos-top representam do total (
                                    {metrica === 'quantidade' ? 'quantidade' : 'valor'})
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around">
                            <DonutChart
                                itens={fatiasPizza}
                                centro={{
                                    titulo: 'Total',
                                    valor: formatarValor(totalPizza),
                                }}
                            />

                            <div className="w-full max-w-sm space-y-1.5">
                                {fatiasPizza.map((fatia) => {
                                    const pct =
                                        totalPizza > 0 ? (fatia.value / totalPizza) * 100 : 0;

                                    return (
                                        <div
                                            key={fatia.label}
                                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                        >
                                            <div className="flex min-w-0 items-center gap-2">
                                                <span
                                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                    style={{ backgroundColor: fatia.cor }}
                                                />
                                                <span className="truncate text-zinc-700 dark:text-zinc-300">
                                                    {fatia.label}
                                                </span>
                                            </div>
                                            <span className="shrink-0 font-semibold text-zinc-900 dark:text-white">
                                                {pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
