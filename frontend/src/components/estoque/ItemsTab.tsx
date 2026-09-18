'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Check,
    Loader2,
    Pencil,
    Plus,
    Search,
    X,
} from 'lucide-react';

type UnidadeMedida = 'KG' | 'UNIDADE';

type StockItem = {
    id: string;
    nome: string;
    categoria: string | null;
    unidadeMedida: UnidadeMedida;
    quantidadeAtual: number;
    valorMedioUnitario: number | null;
    valorEstoque: number | null;
    negativo: boolean;
    estoqueMinimo: number | null;
    abaixoDoMinimo: boolean;
    quantidadeSugerida: number;
    ingredientId: string | null;
    ingredienteNome: string | null;
    active: boolean;
};

type IngredientOption = { id: string; nome: string };

function formatQtd(item: StockItem) {
    const numero = item.quantidadeAtual.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return item.unidadeMedida === 'KG' ? `${numero} kg` : `${numero} un`;
}

function formatMoeda(valor: number | null) {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ItemsTab({ refreshKey }: { refreshKey?: number }) {
    const [items, setItems] = useState<StockItem[]>([]);
    const [ingredientes, setIngredientes] = useState<IngredientOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [onlyNegative, setOnlyNegative] = useState(false);

    const [showNew, setShowNew] = useState(false);
    const [novoNome, setNovoNome] = useState('');
    const [novaCategoria, setNovaCategoria] = useState('');
    const [novaUnidade, setNovaUnidade] = useState<UnidadeMedida>('KG');
    const [novoMinimo, setNovoMinimo] = useState('');
    const [salvandoNovo, setSalvandoNovo] = useState(false);

    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [formCategoria, setFormCategoria] = useState('');
    const [formUnidade, setFormUnidade] = useState<UnidadeMedida>('KG');
    const [formIngredientId, setFormIngredientId] = useState('');
    const [formMinimo, setFormMinimo] = useState('');
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [itemsRes, ingredientesRes] = await Promise.all([
                api.get('/estoque/itens', {
                    params: { storeId: store.id, search: search || undefined, onlyNegative: onlyNegative || undefined },
                }),
                api.get('/product-sales/ingredients', { params: { storeId: store.id } }),
            ]);

            setItems(itemsRes.data);
            setIngredientes(ingredientesRes.data.map((i: any) => ({ id: i.id, nome: i.nome })));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, onlyNegative]);

    useEffect(() => {
        const timeout = setTimeout(load, 350);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    async function criarItem() {
        const store = getActiveStore();
        if (!store || !novoNome.trim()) return;

        try {
            setSalvandoNovo(true);
            await api.post('/estoque/itens', {
                storeId: store.id,
                nome: novoNome.trim(),
                categoria: novaCategoria.trim() || undefined,
                unidadeMedida: novaUnidade,
                estoqueMinimo: novoMinimo.trim() ? Number(novoMinimo.replace(',', '.')) : undefined,
            });

            toast.success('Item criado.');
            setNovoNome('');
            setNovaCategoria('');
            setNovaUnidade('KG');
            setNovoMinimo('');
            setShowNew(false);
            await load();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao criar o item.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvandoNovo(false);
        }
    }

    function iniciarEdicao(item: StockItem) {
        setEditandoId(item.id);
        setFormCategoria(item.categoria || '');
        setFormUnidade(item.unidadeMedida);
        setFormIngredientId(item.ingredientId || '');
        setFormMinimo(item.estoqueMinimo != null ? String(item.estoqueMinimo) : '');
    }

    async function salvarEdicao(id: string) {
        try {
            setSalvandoEdicao(true);
            await api.patch(`/estoque/itens/${id}`, {
                categoria: formCategoria.trim() || null,
                unidadeMedida: formUnidade,
                ingredientId: formIngredientId || '',
                estoqueMinimo: formMinimo.trim() ? Number(formMinimo.replace(',', '.')) : 0,
            });

            toast.success('Item atualizado.');
            setEditandoId(null);
            await load();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao atualizar o item.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvandoEdicao(false);
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
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar item..."
                        className="w-full rounded-xl border border-zinc-200 bg-transparent py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                    />
                </div>

                <label className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    <input
                        type="checkbox"
                        checked={onlyNegative}
                        onChange={(e) => setOnlyNegative(e.target.checked)}
                        className="accent-red-600"
                    />
                    Só negativos
                </label>

                <button
                    onClick={() => setShowNew((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                    <Plus size={14} />
                    Novo item
                </button>
            </div>

            {showNew && (
                <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex-1 min-w-[180px]">
                        <label className="text-xs text-zinc-500">Nome</label>
                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                    <div className="min-w-[160px]">
                        <label className="text-xs text-zinc-500">Categoria (opcional)</label>
                        <input
                            value={novaCategoria}
                            onChange={(e) => setNovaCategoria(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-zinc-500">Unidade</label>
                        <select
                            value={novaUnidade}
                            onChange={(e) => setNovaUnidade(e.target.value as UnidadeMedida)}
                            className="mt-1 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        >
                            <option value="KG">KG</option>
                            <option value="UNIDADE">Unidade</option>
                        </select>
                    </div>
                    <div className="w-28">
                        <label className="text-xs text-zinc-500">Mínimo (opcional)</label>
                        <input
                            value={novoMinimo}
                            onChange={(e) => setNovoMinimo(e.target.value)}
                            inputMode="decimal"
                            placeholder="0"
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                    <button
                        onClick={criarItem}
                        disabled={salvandoNovo || !novoNome.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {salvandoNovo ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Criar
                    </button>
                </div>
            )}

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum item de estoque ainda — crie um acima, vincule itens de uma
                    NF aceita, ou importe a planilha modelo.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                <th className="px-4 py-3 font-medium">Item</th>
                                <th className="px-4 py-3 font-medium">Categoria</th>
                                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                                <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                                <th className="px-4 py-3 text-right font-medium">Custo médio</th>
                                <th className="px-4 py-3 text-right font-medium">Valor em estoque</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {items.map((item) => {
                                const editando = editandoId === item.id;

                                return (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                            {item.nome}
                                            {item.ingredienteNome && (
                                                <span
                                                    className="ml-1.5 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500"
                                                    title="Vinculado ao ingrediente da ficha técnica — recebe baixa automática"
                                                >
                                                    ↳ {item.ingredienteNome}
                                                </span>
                                            )}
                                        </td>

                                        {editando ? (
                                            <td colSpan={5} className="px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <input
                                                        value={formCategoria}
                                                        onChange={(e) => setFormCategoria(e.target.value)}
                                                        placeholder="Categoria"
                                                        className="w-36 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    />
                                                    <select
                                                        value={formUnidade}
                                                        onChange={(e) => setFormUnidade(e.target.value as UnidadeMedida)}
                                                        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    >
                                                        <option value="KG">KG</option>
                                                        <option value="UNIDADE">Unidade</option>
                                                    </select>
                                                    <input
                                                        value={formMinimo}
                                                        onChange={(e) => setFormMinimo(e.target.value)}
                                                        inputMode="decimal"
                                                        placeholder="Mínimo"
                                                        title="Estoque mínimo — abaixo disso entra na Lista de Compra"
                                                        className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    />
                                                    <select
                                                        value={formIngredientId}
                                                        onChange={(e) => setFormIngredientId(e.target.value)}
                                                        title="Vincular a um ingrediente da ficha técnica pra receber baixa automática"
                                                        className="max-w-[220px] rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    >
                                                        <option value="">Sem vínculo com ingrediente</option>
                                                        {ingredientes.map((ing) => (
                                                            <option key={ing.id} value={ing.id}>
                                                                {ing.nome}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        onClick={() => salvarEdicao(item.id)}
                                                        disabled={salvandoEdicao}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                    >
                                                        {salvandoEdicao ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Check size={14} />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditandoId(null)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3 text-zinc-500">{item.categoria || '—'}</td>
                                                <td
                                                    className={`px-4 py-3 text-right font-semibold ${item.negativo ? 'text-red-500' : 'text-zinc-900 dark:text-white'
                                                        }`}
                                                >
                                                    <div className="inline-flex items-center gap-1">
                                                        {item.negativo && <AlertTriangle size={13} />}
                                                        {formatQtd(item)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {item.estoqueMinimo != null ? (
                                                        <span
                                                            className={
                                                                item.abaixoDoMinimo
                                                                    ? 'inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-600'
                                                                    : 'text-xs text-zinc-500'
                                                            }
                                                            title={
                                                                item.abaixoDoMinimo
                                                                    ? `Abaixo do mínimo — comprar ${item.quantidadeSugerida.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`
                                                                    : undefined
                                                            }
                                                        >
                                                            {item.abaixoDoMinimo && <AlertTriangle size={12} />}
                                                            {item.estoqueMinimo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-zinc-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-zinc-500">
                                                    {item.valorMedioUnitario != null
                                                        ? formatMoeda(item.valorMedioUnitario)
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-zinc-500">
                                                    {formatMoeda(item.valorEstoque)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => iniciarEdicao(item)}
                                                        title="Editar"
                                                        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            <p className="text-xs text-zinc-500">
                Saldo negativo (em vermelho) significa que a baixa automática
                descontou mais do que tinha entrada registrada — não trava nada,
                só avisa que pode faltar lançar uma compra ou corrigir manualmente
                na aba Movimentar.
            </p>
        </div>
    );
}
