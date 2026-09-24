'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';

type StockItemOption = { id: string; nome: string; unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE' };

type Movement = {
    id: string;
    stockItemNome: string;
    unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
    tipo: 'ENTRADA' | 'SAIDA';
    origem: 'NF_COMPRA' | 'MANUAL' | 'IMPORTACAO_PLANILHA' | 'CONSUMO_VENDA';
    quantidade: number;
    valorTotal: number | null;
    observacao: string | null;
    data: string;
    criadoPor: string | null;
};

const ORIGEM_LABEL: Record<Movement['origem'], string> = {
    NF_COMPRA: 'Vínculo de NF',
    MANUAL: 'Lançamento manual',
    IMPORTACAO_PLANILHA: 'Planilha',
    CONSUMO_VENDA: 'Baixa automática (venda)',
};

export function MovementsTab({ onChanged }: { onChanged: () => void }) {
    const [items, setItems] = useState<StockItemOption[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    const [stockItemId, setStockItemId] = useState('');
    const [tipo, setTipo] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');
    const [quantidade, setQuantidade] = useState('');
    const [valorTotal, setValorTotal] = useState('');
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    async function loadItems() {
        const store = getActiveStore();
        if (!store) return;

        const response = await api.get('/estoque/itens', { params: { storeId: store.id } });
        setItems(response.data);
    }

    async function loadMovements() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoadingList(true);
            const response = await api.get('/estoque/movimentacoes', {
                params: { storeId: store.id, pageSize: 25 },
            });
            setMovements(response.data.items);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingList(false);
        }
    }

    useEffect(() => {
        loadItems();
        loadMovements();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function registrar() {
        const store = getActiveStore();
        if (!store || !stockItemId || !quantidade) return;

        try {
            setSalvando(true);
            await api.post('/estoque/movimentacoes', {
                storeId: store.id,
                stockItemId,
                tipo,
                quantidade: Number(quantidade),
                valorTotal: valorTotal ? Number(valorTotal) : undefined,
                observacao: observacao || undefined,
            });

            toast.success('Lançamento registrado.');
            setQuantidade('');
            setValorTotal('');
            setObservacao('');
            await loadMovements();
            onChanged();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao registrar o lançamento.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvando(false);
        }
    }

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-white">
                    Lançamento manual
                </p>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[200px] flex-1">
                        <label className="text-xs text-zinc-500">Item</label>
                        <select
                            value={stockItemId}
                            onChange={(e) => setStockItemId(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        >
                            <option value="">Selecione...</option>
                            {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.nome}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-500">Tipo</label>
                        <div className="mt-1 flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                            <button
                                onClick={() => setTipo('ENTRADA')}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium ${tipo === 'ENTRADA'
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-300'
                                    }`}
                            >
                                <ArrowDownCircle size={13} /> Entrada
                            </button>
                            <button
                                onClick={() => setTipo('SAIDA')}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium ${tipo === 'SAIDA'
                                    ? 'bg-red-500 text-white'
                                    : 'text-zinc-600 dark:text-zinc-300'
                                    }`}
                            >
                                <ArrowUpCircle size={13} /> Saída / ajuste
                            </button>
                        </div>
                    </div>

                    <div className="w-32">
                        <label className="text-xs text-zinc-500">Quantidade</label>
                        <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={quantidade}
                            onChange={(e) => setQuantidade(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>

                    <div className="w-36">
                        <label className="text-xs text-zinc-500">Valor total (opcional)</label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={valorTotal}
                            onChange={(e) => setValorTotal(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>

                    <div className="min-w-[180px] flex-1">
                        <label className="text-xs text-zinc-500">Observação (opcional)</label>
                        <input
                            value={observacao}
                            onChange={(e) => setObservacao(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>

                    <button
                        onClick={registrar}
                        disabled={salvando || !stockItemId || !quantidade}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {salvando && <Loader2 size={14} className="animate-spin" />}
                        Lançar
                    </button>
                </div>
            </div>

            <div>
                <p className="mb-2 text-sm font-semibold text-zinc-900 dark:text-white">
                    Últimas movimentações
                </p>

                {loadingList ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                        Carregando...
                    </div>
                ) : movements.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                        Nenhuma movimentação ainda.
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                    <th className="px-4 py-3 font-medium">Item</th>
                                    <th className="px-4 py-3 font-medium">Origem</th>
                                    <th className="px-4 py-3 text-right font-medium">Quantidade</th>
                                    <th className="px-4 py-3 text-right font-medium">Valor</th>
                                    <th className="px-4 py-3 font-medium">Data</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {movements.map((mov) => (
                                    <tr key={mov.id}>
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                            {mov.stockItemNome}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500">{ORIGEM_LABEL[mov.origem]}</td>
                                        <td
                                            className={`px-4 py-3 text-right font-semibold ${mov.tipo === 'ENTRADA' ? 'text-emerald-600' : 'text-red-500'
                                                }`}
                                        >
                                            {mov.tipo === 'ENTRADA' ? '+' : '-'}
                                            {mov.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}{' '}
                                            {mov.unidadeMedida === 'KG'
                                                ? 'kg'
                                                : mov.unidadeMedida === 'LITRO'
                                                  ? 'L'
                                                  : 'un'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-zinc-500">
                                            {mov.valorTotal != null
                                                ? mov.valorTotal.toLocaleString('pt-BR', {
                                                    style: 'currency',
                                                    currency: 'BRL',
                                                })
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500">
                                            {new Date(mov.data).toLocaleDateString('pt-BR')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
