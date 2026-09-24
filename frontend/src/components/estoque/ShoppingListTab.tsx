'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { AlertTriangle, ShoppingCart } from 'lucide-react';

type UnidadeMedida = 'KG' | 'LITRO' | 'UNIDADE';

type ItemListaCompra = {
    id: string;
    nome: string;
    categoria: string | null;
    unidadeMedida: UnidadeMedida;
    quantidadeAtual: number;
    estoqueMinimo: number;
    quantidadeSugerida: number;
    custoEstimado: number | null;
};

function formatQtd(valor: number, unidade: UnidadeMedida) {
    const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    if (unidade === 'KG') return `${numero} kg`;
    if (unidade === 'LITRO') return `${numero} L`;
    return `${numero} un`;
}

function formatMoeda(valor: number | null) {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ShoppingListTab({ refreshKey }: { refreshKey?: number }) {
    const [itens, setItens] = useState<ItemListaCompra[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const response = await api.get('/estoque/lista-compra', { params: { storeId: store.id } });
            setItens(response.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    const custoTotal = itens.reduce((soma, item) => soma + (item.custoEstimado ?? 0), 0);

    return (
        <div className="space-y-4">
            <p className="text-xs text-zinc-500">
                Itens com <strong>estoque mínimo</strong> configurado (aba Itens) cujo
                saldo atual está abaixo dele. Quantidade sugerida é só a diferença até
                o mínimo — ajuste como preferir na hora de comprar.
            </p>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : itens.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum item abaixo do mínimo — tudo em dia. Configure o "Mínimo" de
                    um item na aba Itens pra ele entrar nessa lista quando faltar.
                </div>
            ) : (
                <>
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                    <th className="px-4 py-3 font-medium">Item</th>
                                    <th className="px-4 py-3 font-medium">Categoria</th>
                                    <th className="px-4 py-3 text-right font-medium">Saldo atual</th>
                                    <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                                    <th className="px-4 py-3 text-right font-medium">Comprar</th>
                                    <th className="px-4 py-3 text-right font-medium">Custo estimado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {itens.map((item) => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                            <div className="inline-flex items-center gap-1.5">
                                                <AlertTriangle size={13} className="text-amber-500" />
                                                {item.nome}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500">{item.categoria || '—'}</td>
                                        <td className="px-4 py-3 text-right text-zinc-500">
                                            {formatQtd(item.quantidadeAtual, item.unidadeMedida)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-500">
                                            {formatQtd(item.estoqueMinimo, item.unidadeMedida)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-amber-600">
                                            {formatQtd(item.quantidadeSugerida, item.unidadeMedida)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-500">
                                            {formatMoeda(item.custoEstimado)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
                        <div className="inline-flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
                            <ShoppingCart size={16} />
                            {itens.length} {itens.length === 1 ? 'item abaixo' : 'itens abaixo'} do mínimo
                        </div>
                        <div className="text-zinc-600 dark:text-zinc-300">
                            Custo estimado total: <strong>{formatMoeda(custoTotal || null)}</strong>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
