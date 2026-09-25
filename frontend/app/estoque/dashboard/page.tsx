'use client';

import { useEffect, useState } from 'react';
import {
    AlertTriangle,
    ArrowDownCircle,
    ArrowUpCircle,
    Boxes,
    PackageMinus,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ColumnChart } from '../../../src/components/product-sales/charts/ColumnChart';

type PorCategoria = { categoria: string; quantidadeItens: number; valorEstoque: number };

type ItemCritico = {
    id: string;
    nome: string;
    unidadeMedida: 'KG' | 'UNIDADE';
    quantidadeAtual: number;
    estoqueMinimo: number | null;
    quantidadeSugerida: number;
};

type Movimentacao = {
    id: string;
    stockItemNome: string;
    unidadeMedida: 'KG' | 'UNIDADE';
    tipo: string;
    origem: string;
    quantidade: number;
    data: string;
};

type Dashboard = {
    totalItens: number;
    itensAbaixoDoMinimo: number;
    itensNegativos: number;
    valorTotalEstoque: number;
    porCategoria: PorCategoria[];
    itensCriticos: ItemCritico[];
    ultimasMovimentacoes: Movimentacao[];
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyCompact(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
    });
}

function formatQtd(qtd: number, unidade: 'KG' | 'UNIDADE') {
    const numero = qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return unidade === 'KG' ? `${numero} kg` : `${numero} un`;
}

function truncar(texto: string, tamanho: number) {
    return texto.length > tamanho ? `${texto.slice(0, tamanho - 1)}…` : texto;
}

export default function EstoqueDashboardPage() {
    const [data, setData] = useState<Dashboard | null>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        const store = getActiveStore();
        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/estoque/dashboard', {
                params: { storeId: store.id },
            });
            setData(response.data);
        } catch {
            toast.error('Erro ao carregar o dashboard de estoque.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!getActiveStore()) {
        return (
            <AppLayout title="Dashboard de Estoque">
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Selecione uma loja ativa no topo do sistema.
                </div>
            </AppLayout>
        );
    }

    const categoriaItens = (data?.porCategoria || []).map((c) => ({
        label: truncar(c.categoria, 18),
        value: c.valorEstoque,
    }));

    return (
        <AppLayout title="Dashboard de Estoque">
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold">Dashboard de Estoque</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Visão geral do que está parado na loja ativa — valor total,
                        itens abaixo do mínimo e últimas movimentações.
                    </p>
                </div>

                {loading && !data ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
                ) : (
                    <>
                        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <SummaryCard
                                icon={Wallet}
                                label="Valor total em estoque"
                                value={formatCurrency(data?.valorTotalEstoque || 0)}
                                colorClass="text-blue-500"
                            />
                            <SummaryCard
                                icon={Boxes}
                                label="Itens cadastrados"
                                value={String(data?.totalItens || 0)}
                                colorClass="text-blue-500"
                            />
                            <SummaryCard
                                icon={AlertTriangle}
                                label="Abaixo do mínimo"
                                value={String(data?.itensAbaixoDoMinimo || 0)}
                                colorClass="text-amber-500"
                                danger={(data?.itensAbaixoDoMinimo || 0) > 0}
                            />
                            <SummaryCard
                                icon={PackageMinus}
                                label="Saldo negativo"
                                value={String(data?.itensNegativos || 0)}
                                colorClass="text-red-500"
                                danger={(data?.itensNegativos || 0) > 0}
                            />
                        </section>

                        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                                <h3 className="mb-4 text-sm font-semibold">
                                    Valor em estoque por categoria
                                </h3>

                                {categoriaItens.length === 0 ? (
                                    <p className="flex h-56 items-center justify-center text-center text-sm text-zinc-400">
                                        Nenhum item com valor em estoque ainda.
                                    </p>
                                ) : (
                                    <>
                                        <ColumnChart
                                            itens={categoriaItens}
                                            corDe="#34d399"
                                            corPara="#059669"
                                            formatarValor={formatCurrencyCompact}
                                        />
                                        <ul className="mt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                            {(data?.porCategoria || []).map((c) => (
                                                <li
                                                    key={c.categoria}
                                                    className="flex items-center justify-between gap-3 text-sm"
                                                >
                                                    <span className="truncate">
                                                        {c.categoria}{' '}
                                                        <span className="text-xs text-zinc-400">
                                                            ({c.quantidadeItens} itens)
                                                        </span>
                                                    </span>
                                                    <span className="shrink-0 font-semibold">
                                                        {formatCurrency(c.valorEstoque)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>

                            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                                    <AlertTriangle size={16} className="text-amber-500" />
                                    Itens críticos (abaixo do mínimo)
                                </h3>

                                {(data?.itensCriticos || []).length === 0 ? (
                                    <p className="flex h-40 items-center justify-center text-center text-sm text-zinc-400">
                                        Nenhum item abaixo do mínimo. 🎉
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(data?.itensCriticos || []).map((item) => (
                                            <li
                                                key={item.id}
                                                className="flex items-center justify-between gap-3 rounded-xl bg-amber-500/5 px-3 py-2 text-sm"
                                            >
                                                <span className="truncate font-medium">{item.nome}</span>
                                                <span className="shrink-0 text-xs text-zinc-500">
                                                    {formatQtd(item.quantidadeAtual, item.unidadeMedida)} / mín.{' '}
                                                    {item.estoqueMinimo != null
                                                        ? formatQtd(item.estoqueMinimo, item.unidadeMedida)
                                                        : '—'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <h3 className="mb-4 text-sm font-semibold">Últimas movimentações</h3>

                            {(data?.ultimasMovimentacoes || []).length === 0 ? (
                                <p className="flex h-24 items-center justify-center text-center text-sm text-zinc-400">
                                    Nenhuma movimentação registrada ainda.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {(data?.ultimasMovimentacoes || []).map((mov) => {
                                        const entrada = mov.tipo === 'ENTRADA';
                                        return (
                                            <li
                                                key={mov.id}
                                                className="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span className="flex min-w-0 items-center gap-2 truncate">
                                                    {entrada ? (
                                                        <ArrowUpCircle size={15} className="shrink-0 text-blue-500" />
                                                    ) : (
                                                        <ArrowDownCircle size={15} className="shrink-0 text-red-500" />
                                                    )}
                                                    {mov.stockItemNome}
                                                </span>
                                                <span className="shrink-0 text-xs text-zinc-500">
                                                    {entrada ? '+' : '-'}
                                                    {formatQtd(mov.quantidade, mov.unidadeMedida)} ·{' '}
                                                    {new Date(mov.data).toLocaleDateString('pt-BR')}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
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
    colorClass,
    danger = false,
}: {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    value: string;
    colorClass: string;
    danger?: boolean;
}) {
    return (
        <div
            className={`rounded-3xl border p-5 ${danger
                ? 'border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/[0.06]'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                }`}
        >
            <div className="flex items-center gap-2">
                <Icon size={18} className={colorClass} />
                <p className="text-sm text-zinc-500">{label}</p>
            </div>

            <strong className={`mt-2 block text-2xl ${colorClass}`}>{value}</strong>
        </div>
    );
}
