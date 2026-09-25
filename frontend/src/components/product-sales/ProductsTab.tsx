'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ArrowLeft, ChefHat, Package, Search, TrendingUp } from 'lucide-react';

import { RecipeModal } from './RecipeModal';

type ProductSummaryItem = {
    produto: string;
    produtoChave: string;
    categoria: string;
    quantidade: number;
    valor: number;
    ticketMedio: number;
    temReceita: boolean;
};

type CategorySummary = {
    categoria: string;
    totalQuantidade: number;
    totalValor: number;
    produtoMaisVendido: string | null;
};

type ProductSummary = {
    totalProdutos: number;
    totalQuantidade: number;
    totalValor: number;
    categorias: string[];
    porCategoria: CategorySummary[];
    produtos: ProductSummaryItem[];
};

function formatarMoeda(valor: number) {
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatarNumero(valor: number) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

const CATEGORY_COLORS = [
    'bg-blue-500/10 text-blue-500',
    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'bg-amber-500/10 text-amber-500',
    'bg-purple-500/10 text-purple-500',
    'bg-pink-500/10 text-pink-500',
    'bg-indigo-500/10 text-indigo-500',
    'bg-orange-500/10 text-orange-500',
    'bg-cyan-500/10 text-cyan-500',
];

export function ProductsTab({
    refreshKey,
    importId,
}: {
    refreshKey?: number;
    importId?: string | null;
}) {
    const [summary, setSummary] = useState<ProductSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(
        null,
    );
    const [produtosLocal, setProdutosLocal] = useState<ProductSummaryItem[]>([]);
    const [produtoReceita, setProdutoReceita] = useState<string | null>(null);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);

            const response = await api.get('/product-sales/summary', {
                params: { storeId: store.id, importId: importId || undefined },
            });

            setSummary(response.data);
            setProdutosLocal(response.data?.produtos ?? []);
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

    const itensDaCategoria = useMemo(() => {
        if (!categoriaSelecionada) return [];

        const termo = busca.trim().toLowerCase();

        return produtosLocal
            .filter((p) => p.categoria === categoriaSelecionada)
            .filter((p) => !termo || p.produto.toLowerCase().includes(termo))
            .sort((a, b) => b.valor - a.valor);
    }, [produtosLocal, categoriaSelecionada, busca]);

    const store = getActiveStore();

    if (!loading && !summary) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    // ---------- Nível 2: itens de uma categoria ----------
    if (categoriaSelecionada) {
        return (
            <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                        onClick={() => {
                            setCategoriaSelecionada(null);
                            setBusca('');
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <ArrowLeft size={16} />
                        Categorias
                    </button>

                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                        {categoriaSelecionada}
                    </h3>

                    <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700 sm:max-w-xs">
                        <Search size={16} className="text-zinc-400" />
                        <input
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar produto..."
                            className="w-full bg-transparent text-sm outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                <th className="px-4 py-3 font-medium">Produto</th>
                                <th className="px-4 py-3 text-right font-medium">Qtd. vendida</th>
                                <th className="px-4 py-3 text-right font-medium">Valor total</th>
                                <th className="px-4 py-3 text-right font-medium">Ticket médio</th>
                                <th className="px-4 py-3 text-right font-medium">
                                    Ficha técnica
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {itensDaCategoria.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                                        Nenhum produto encontrado.
                                    </td>
                                </tr>
                            ) : (
                                itensDaCategoria.map((item) => (
                                    <tr
                                        key={item.produtoChave}
                                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                    >
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                            {item.produto}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-700 dark:text-zinc-300">
                                            {formatarNumero(item.quantidade)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-white">
                                            {formatarMoeda(item.valor)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-500">
                                            {formatarMoeda(item.ticketMedio)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => setProdutoReceita(item.produto)}
                                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${item.temReceita
                                                        ? 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400'
                                                        : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                                                    }`}
                                            >
                                                <ChefHat size={13} />
                                                {item.temReceita ? 'Configurada' : 'Configurar'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <p className="text-xs text-zinc-500">
                    Configure a ficha técnica de cada prato (quais ingredientes
                    e quantas gramas de cada) pra acompanhar o consumo total
                    de cada ingrediente na aba &quot;Ingredientes&quot; —
                    inclusive somando pratos diferentes que usam o mesmo
                    ingrediente.
                </p>

                {produtoReceita && store && (
                    <RecipeModal
                        storeId={store.id}
                        produto={produtoReceita}
                        onClose={() => setProdutoReceita(null)}
                        onSaved={load}
                    />
                )}
            </div>
        );
    }

    // ---------- Nível 1: quadrados de categoria ----------
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <TrendingUp size={18} />
                    </div>
                    <p className="text-xs text-zinc-500">Valor vendido (total)</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                        {loading ? '...' : formatarMoeda(summary?.totalValor ?? 0)}
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : !summary || summary.porCategoria.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum produto encontrado — importe uma planilha na aba
                    &quot;Importar&quot;.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {summary.porCategoria.map((cat, index) => (
                        <button
                            key={cat.categoria}
                            onClick={() => setCategoriaSelecionada(cat.categoria)}
                            className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 text-left transition hover:border-blue-500/40 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                        >
                            <div className="flex items-center justify-between">
                                <div
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]
                                        }`}
                                >
                                    <Package size={18} />
                                </div>
                            </div>

                            <div>
                                <p className="font-bold text-zinc-900 dark:text-white">
                                    {cat.categoria}
                                </p>
                                {cat.produtoMaisVendido && (
                                    <p className="text-xs text-zinc-500">
                                        Mais vendido: {cat.produtoMaisVendido}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <span className="text-zinc-500">
                                    {formatarNumero(cat.totalQuantidade)} vendido(s)
                                </span>
                                <span className="font-semibold text-zinc-900 dark:text-white">
                                    {formatarMoeda(cat.totalValor)}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
