'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { ClipboardList, Plus, Send, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type SupplierCategory = {
    id: string;
    name: string;
};

type UnidadeMedida = 'KG' | 'LITRO' | 'UNIDADE';

type SuggestedItem = {
    id: string;
    stockItemId: string | null;
    descricao: string;
    unidadeMedida: UnidadeMedida;
    quantidadeAtual: number | null;
    quantidadeMinima: number | null;
    quantidadeMaxima: number | null;
    quantidadeSugerida: number;
    overrideAplicado: boolean;
};

type StockItemOption = {
    id: string;
    nome: string;
    categoria: string | null;
    unidadeMedida: UnidadeMedida;
};

type CandidateSupplier = {
    id: string;
    name: string;
    phone: string | null;
};

function formatQtd(valor: number, unidade: UnidadeMedida) {
    const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    if (unidade === 'KG') return `${numero} kg`;
    if (unidade === 'LITRO') return `${numero} L`;
    return `${numero} un`;
}

export function SuggestedListTab() {
    const [categories, setCategories] = useState<SupplierCategory[]>([]);
    const [hoje, setHoje] = useState<{
        diaSemanaLabel: string;
        categorias: SupplierCategory[];
    } | null>(null);

    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [items, setItems] = useState<SuggestedItem[] | null>(null);
    const [loadingItems, setLoadingItems] = useState(false);
    const [loading, setLoading] = useState(true);

    // Itens do Estoque dessa loja — carregado uma vez, usado pra montar
    // o seletor de "adicionar item" (busca por nome do lado do cliente).
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
    const [stockSearch, setStockSearch] = useState('');
    const [selectedStockItemId, setSelectedStockItemId] = useState('');
    const [adding, setAdding] = useState(false);

    // Item avulso (sem vínculo com o Estoque).
    const [manualMode, setManualMode] = useState(false);
    const [manualDescricao, setManualDescricao] = useState('');
    const [manualUnidade, setManualUnidade] = useState<UnidadeMedida>('KG');
    const [manualQtd, setManualQtd] = useState('');

    // Edição inline da quantidade sugerida por linha.
    const [editingQtd, setEditingQtd] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    // Envio da cotação pro WhatsApp dos fornecedores (Fase 3).
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [candidates, setCandidates] = useState<{
        comTelefone: CandidateSupplier[];
        semTelefone: CandidateSupplier[];
    } | null>(null);
    const [sending, setSending] = useState(false);

    const store = getActiveStore();

    async function loadBase() {
        if (!store) return;

        try {
            setLoading(true);

            const [categoriesRes, todayRes, stockRes] = await Promise.all([
                api.get('/suppliers/categories'),
                api.get('/quotations/today', { params: { storeId: store.id } }),
                api.get('/estoque/itens', { params: { storeId: store.id } }),
            ]);

            setCategories(categoriesRes.data || []);
            setHoje(todayRes.data || null);
            setStockItems(stockRes.data || []);
        } catch {
            toast.error('Erro ao carregar categorias');
        } finally {
            setLoading(false);
        }
    }

    async function loadSuggested(categoryId: string) {
        if (!store || !categoryId) return;

        try {
            setLoadingItems(true);

            const response = await api.get('/quotations/suggested-list', {
                params: { storeId: store.id, categoryId },
            });

            setItems(response.data?.items || []);
        } catch {
            toast.error('Erro ao montar a lista sugerida');
            setItems([]);
        } finally {
            setLoadingItems(false);
        }
    }

    useEffect(() => {
        loadBase();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function selectCategory(categoryId: string) {
        setSelectedCategoryId(categoryId);
        setItems(null);
        setCandidates(null);
        if (categoryId) loadSuggested(categoryId);
    }

    async function handleOpenSendPanel() {
        if (!store || !selectedCategoryId) return;

        try {
            setLoadingCandidates(true);

            const response = await api.get('/quotations/candidate-suppliers', {
                params: { storeId: store.id, categoryId: selectedCategoryId },
            });

            setCandidates(response.data);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao buscar fornecedores da categoria',
            );
        } finally {
            setLoadingCandidates(false);
        }
    }

    async function handleConfirmSend() {
        if (!store || !selectedCategoryId) return;

        try {
            setSending(true);

            const response = await api.post('/quotations/send', {
                storeId: store.id,
                categoryId: selectedCategoryId,
            });

            const qtd = response.data?.convidados?.length || 0;
            toast.success(
                `Cotação enviada pra ${qtd} ${qtd === 1 ? 'fornecedor' : 'fornecedores'} por WhatsApp.`,
            );
            setCandidates(null);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao enviar cotação',
            );
        } finally {
            setSending(false);
        }
    }

    const stockItemsInList = useMemo(
        () => new Set((items || []).map((item) => item.stockItemId).filter(Boolean)),
        [items],
    );

    const filteredStockOptions = useMemo(() => {
        const term = stockSearch.trim().toUpperCase();

        return stockItems
            .filter((item) => !stockItemsInList.has(item.id))
            .filter((item) => !term || item.nome.toUpperCase().includes(term))
            .slice(0, 30);
    }, [stockItems, stockSearch, stockItemsInList]);

    async function handleAddFromStock() {
        if (!store || !selectedCategoryId || !selectedStockItemId) {
            toast.error('Escolha um item do Estoque');
            return;
        }

        try {
            setAdding(true);

            await api.post('/quotations/category-items', {
                categoryId: selectedCategoryId,
                storeId: store.id,
                stockItemId: selectedStockItemId,
            });

            setSelectedStockItemId('');
            setStockSearch('');
            await loadSuggested(selectedCategoryId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao adicionar item',
            );
        } finally {
            setAdding(false);
        }
    }

    async function handleAddManual() {
        if (!store || !selectedCategoryId) return;

        if (!manualDescricao.trim() || !manualQtd) {
            toast.error('Preencha descrição e quantidade');
            return;
        }

        try {
            setAdding(true);

            await api.post('/quotations/category-items', {
                categoryId: selectedCategoryId,
                storeId: store.id,
                descricaoManual: manualDescricao,
                unidadeMedidaManual: manualUnidade,
                quantidadeSugeridaOverride: Number(
                    manualQtd.replace(',', '.'),
                ),
            });

            setManualDescricao('');
            setManualQtd('');
            setManualMode(false);
            await loadSuggested(selectedCategoryId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao adicionar item avulso',
            );
        } finally {
            setAdding(false);
        }
    }

    async function handleRemove(id: string) {
        if (!selectedCategoryId) return;

        try {
            await api.delete(`/quotations/category-items/${id}`);
            await loadSuggested(selectedCategoryId);
        } catch {
            toast.error('Erro ao remover item da lista');
        }
    }

    async function handleSaveQtd(id: string) {
        if (!selectedCategoryId) return;

        const raw = editingQtd[id];
        if (raw === undefined) return;

        const valor = Number(raw.replace(',', '.'));

        if (Number.isNaN(valor) || valor < 0) {
            toast.error('Quantidade inválida');
            return;
        }

        try {
            setSavingId(id);

            await api.patch(`/quotations/category-items/${id}`, {
                quantidadeSugeridaOverride: valor,
            });

            setEditingQtd((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });

            await loadSuggested(selectedCategoryId);
        } catch {
            toast.error('Erro ao salvar quantidade');
        } finally {
            setSavingId(null);
        }
    }

    if (!store) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Selecione uma loja ativa no topo do sistema.
            </p>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-500">
                    <ClipboardList size={20} />
                </div>

                <div>
                    <h2 className="text-lg font-bold">Lista sugerida</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Monte manualmente os itens de cada categoria — dá
                        pra puxar do Estoque (a quantidade sugerida vem do
                        máximo menos o atual, editável) ou incluir um item
                        avulso.
                    </p>
                </div>
            </div>

            {!loading && hoje && hoje.categorias.length > 0 && (
                <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-400">
                        <Sparkles size={15} />
                        Hoje é dia de ({hoje.diaSemanaLabel}):
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {hoje.categorias.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => selectCategory(category.id)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${selectedCategoryId === category.id
                                    ? 'border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400'
                                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                                    }`}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div>
                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                    Ou escolha qualquer categoria
                </label>
                <select
                    value={selectedCategoryId}
                    onChange={(e) => selectCategory(e.target.value)}
                    className="h-11 w-full max-w-sm rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                >
                    <option value="">Selecione...</option>
                    {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                            {category.name}
                        </option>
                    ))}
                </select>
            </div>

            {selectedCategoryId && items !== null && items.length > 0 && (
                <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
                    {!candidates ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                Lista pronta com {items.length}{' '}
                                {items.length === 1 ? 'item' : 'itens'}. Envie
                                pra os fornecedores dessa categoria pedirem
                                preço por WhatsApp.
                            </p>
                            <button
                                type="button"
                                disabled={loadingCandidates}
                                onClick={handleOpenSendPanel}
                                className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                            >
                                <Send size={14} />
                                {loadingCandidates
                                    ? 'Verificando fornecedores...'
                                    : 'Enviar cotação pros fornecedores'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold">
                                Confirmar envio da cotação
                            </p>

                            {candidates.comTelefone.length === 0 ? (
                                <p className="text-sm text-red-500">
                                    Nenhum fornecedor dessa categoria tem
                                    telefone cadastrado. Cadastre o telefone
                                    em Cadastros → Fornecedores antes de
                                    enviar.
                                </p>
                            ) : (
                                <div>
                                    <p className="mb-1.5 text-xs text-zinc-500">
                                        Vão receber o link por WhatsApp:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {candidates.comTelefone.map((s) => (
                                            <span
                                                key={s.id}
                                                className="rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-700 dark:text-teal-400"
                                            >
                                                {s.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {candidates.semTelefone.length > 0 && (
                                <div>
                                    <p className="mb-1.5 text-xs text-zinc-500">
                                        Sem telefone cadastrado (não vão
                                        receber):
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {candidates.semTelefone.map((s) => (
                                            <span
                                                key={s.id}
                                                className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-500"
                                            >
                                                {s.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    disabled={
                                        sending ||
                                        candidates.comTelefone.length === 0
                                    }
                                    onClick={handleConfirmSend}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                >
                                    <Send size={14} />
                                    {sending
                                        ? 'Enviando...'
                                        : 'Confirmar e enviar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={sending}
                                    onClick={() => setCandidates(null)}
                                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedCategoryId && (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <p className="mb-3 text-sm font-semibold">
                        Adicionar item à lista
                    </p>

                    {!manualMode ? (
                        <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={stockSearch}
                                    onChange={(e) => {
                                        setStockSearch(e.target.value);
                                        setSelectedStockItemId('');
                                    }}
                                    placeholder="Buscar item do Estoque..."
                                    className="h-10 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                />
                                <select
                                    value={selectedStockItemId}
                                    onChange={(e) =>
                                        setSelectedStockItemId(e.target.value)
                                    }
                                    className="h-10 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                >
                                    <option value="">
                                        {filteredStockOptions.length === 0
                                            ? 'Nenhum item encontrado'
                                            : 'Selecione o item...'}
                                    </option>
                                    {filteredStockOptions.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.nome}
                                            {item.categoria
                                                ? ` (${item.categoria})`
                                                : ''}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={adding || !selectedStockItemId}
                                    onClick={handleAddFromStock}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                >
                                    <Plus size={14} />
                                    Adicionar
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setManualMode(true)}
                                className="text-xs text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400"
                            >
                                Não está no Estoque? Adicionar item avulso
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <input
                                    value={manualDescricao}
                                    onChange={(e) =>
                                        setManualDescricao(e.target.value)
                                    }
                                    placeholder="Descrição do item"
                                    className="h-10 flex-[2] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                />
                                <select
                                    value={manualUnidade}
                                    onChange={(e) =>
                                        setManualUnidade(
                                            e.target.value as UnidadeMedida,
                                        )
                                    }
                                    className="h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                >
                                    <option value="KG">kg</option>
                                    <option value="LITRO">L</option>
                                    <option value="UNIDADE">un</option>
                                </select>
                                <input
                                    value={manualQtd}
                                    onChange={(e) => setManualQtd(e.target.value)}
                                    placeholder="Qtd sugerida"
                                    inputMode="decimal"
                                    className="h-10 w-32 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                />
                                <button
                                    type="button"
                                    disabled={adding}
                                    onClick={handleAddManual}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                >
                                    <Plus size={14} />
                                    Adicionar
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => setManualMode(false)}
                                className="text-xs text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400"
                            >
                                Voltar pra buscar no Estoque
                            </button>
                        </div>
                    )}
                </div>
            )}

            {loadingItems ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Montando lista...
                </p>
            ) : items !== null ? (
                items.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Essa lista ainda não tem nenhum item — adicione
                        acima.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs text-zinc-500">
                                <tr>
                                    <th className="px-4 py-2.5">Item</th>
                                    <th className="px-4 py-2.5">Atual</th>
                                    <th className="px-4 py-2.5">Mínimo</th>
                                    <th className="px-4 py-2.5">Máximo</th>
                                    <th className="px-4 py-2.5">Sugestão de compra</th>
                                    <th className="px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {items.map((item) => {
                                    const editing = editingQtd[item.id];

                                    return (
                                        <tr key={item.id}>
                                            <td className="px-4 py-2.5 font-medium">
                                                {item.descricao}
                                                {!item.stockItemId && (
                                                    <span className="ml-2 rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                                                        avulso
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                                                {item.quantidadeAtual != null
                                                    ? formatQtd(
                                                        item.quantidadeAtual,
                                                        item.unidadeMedida,
                                                    )
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                                                {item.quantidadeMinima != null
                                                    ? formatQtd(
                                                        item.quantidadeMinima,
                                                        item.unidadeMedida,
                                                    )
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                                                {item.quantidadeMaxima != null
                                                    ? formatQtd(
                                                        item.quantidadeMaxima,
                                                        item.unidadeMedida,
                                                    )
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        value={
                                                            editing !== undefined
                                                                ? editing
                                                                : String(
                                                                    item.quantidadeSugerida,
                                                                )
                                                        }
                                                        onChange={(e) =>
                                                            setEditingQtd(
                                                                (current) => ({
                                                                    ...current,
                                                                    [item.id]:
                                                                        e.target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        inputMode="decimal"
                                                        className="h-8 w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 text-sm font-semibold text-teal-600 dark:text-teal-400 outline-none focus:border-teal-500"
                                                    />
                                                    <span className="text-xs text-zinc-500">
                                                        {item.unidadeMedida ===
                                                            'KG'
                                                            ? 'kg'
                                                            : 'un'}
                                                    </span>
                                                    {editing !== undefined && (
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                savingId ===
                                                                item.id
                                                            }
                                                            onClick={() =>
                                                                handleSaveQtd(
                                                                    item.id,
                                                                )
                                                            }
                                                            className="rounded-lg bg-teal-500 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                                        >
                                                            Salvar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemove(item.id)
                                                    }
                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                    title="Remover da lista"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            ) : null}
        </div>
    );
}
