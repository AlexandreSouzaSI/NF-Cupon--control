'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { getUser } from '@/lib/auth';
import {
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Pencil,
    Plus,
    Save,
    Trash2,
    X,
} from 'lucide-react';
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
    quantidadeSugerida: number;
};

type StockItemOption = {
    id: string;
    nome: string;
    categoria: string | null;
    unidadeMedida: UnidadeMedida;
};

// Aba pra gerenciar as listas de cotação (= categorias de fornecedor) a
// qualquer momento, sem o contexto de "enviar cotação hoje" da Lista
// sugerida — aqui é só: renomear a lista e ajustar os itens dela.

function ListaCard({
    category,
    storeId,
    isAdminMaster,
    stockItems,
    onRenamed,
    onDeleted,
}: {
    category: SupplierCategory;
    storeId: string;
    isAdminMaster: boolean;
    stockItems: StockItemOption[];
    onRenamed: (id: string, name: string) => void;
    onDeleted: (id: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [items, setItems] = useState<SuggestedItem[] | null>(null);
    const [loadingItems, setLoadingItems] = useState(false);

    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState(category.name);
    const [savingName, setSavingName] = useState(false);

    const [stockSearch, setStockSearch] = useState('');
    const [selectedStockItemId, setSelectedStockItemId] = useState('');
    const [adding, setAdding] = useState(false);

    const [manualMode, setManualMode] = useState(false);
    const [manualDescricao, setManualDescricao] = useState('');
    const [manualUnidade, setManualUnidade] = useState<UnidadeMedida>('KG');
    const [manualQtd, setManualQtd] = useState('');

    const [editingQtd, setEditingQtd] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    async function loadItems() {
        try {
            setLoadingItems(true);
            const response = await api.get('/quotations/suggested-list', {
                params: { storeId, categoryId: category.id },
            });
            setItems(response.data?.items || []);
        } catch {
            toast.error('Erro ao carregar os itens dessa lista');
            setItems([]);
        } finally {
            setLoadingItems(false);
        }
    }

    function toggleExpand() {
        const next = !expanded;
        setExpanded(next);
        if (next && items === null) loadItems();
    }

    async function handleSaveName() {
        const trimmed = nameDraft.trim();
        if (!trimmed) {
            toast.error('Digite um nome pra lista');
            return;
        }

        try {
            setSavingName(true);
            await api.patch(`/suppliers/categories/${category.id}`, {
                name: trimmed,
            });
            onRenamed(category.id, trimmed);
            setEditingName(false);
            toast.success('Nome da lista atualizado');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao renomear a lista',
            );
        } finally {
            setSavingName(false);
        }
    }

    async function handleDeleteList() {
        if (
            !confirm(
                `Excluir a lista "${category.name}" definitivamente? Só dá pra excluir se ela nunca teve cotação enviada.`,
            )
        ) {
            return;
        }

        try {
            setDeleting(true);
            await api.delete(`/suppliers/categories/${category.id}`);
            onDeleted(category.id);
            toast.success('Lista excluída');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao excluir a lista',
            );
            setDeleting(false);
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
        if (!selectedStockItemId) {
            toast.error('Escolha um item do Estoque');
            return;
        }

        try {
            setAdding(true);
            await api.post('/quotations/category-items', {
                categoryId: category.id,
                storeId,
                stockItemId: selectedStockItemId,
            });
            setSelectedStockItemId('');
            setStockSearch('');
            await loadItems();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao adicionar item',
            );
        } finally {
            setAdding(false);
        }
    }

    async function handleAddManual() {
        if (!manualDescricao.trim() || !manualQtd) {
            toast.error('Preencha descrição e quantidade');
            return;
        }

        try {
            setAdding(true);
            await api.post('/quotations/category-items', {
                categoryId: category.id,
                storeId,
                descricaoManual: manualDescricao,
                unidadeMedidaManual: manualUnidade,
                quantidadeSugeridaOverride: Number(
                    manualQtd.replace(',', '.'),
                ),
            });
            setManualDescricao('');
            setManualQtd('');
            setManualMode(false);
            await loadItems();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao adicionar item avulso',
            );
        } finally {
            setAdding(false);
        }
    }

    async function handleRemoveItem(id: string) {
        try {
            await api.delete(`/quotations/category-items/${id}`);
            await loadItems();
        } catch {
            toast.error('Erro ao remover item da lista');
        }
    }

    async function handleSaveQtd(id: string) {
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
            await loadItems();
        } catch {
            toast.error('Erro ao salvar quantidade');
        } finally {
            setSavingId(null);
        }
    }

    return (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-2 p-4">
                {editingName ? (
                    <div className="flex flex-1 items-center gap-2">
                        <input
                            autoFocus
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveName();
                                if (e.key === 'Escape') {
                                    setNameDraft(category.name);
                                    setEditingName(false);
                                }
                            }}
                            className="h-9 flex-1 max-w-xs rounded-lg border border-teal-400 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm font-semibold outline-none"
                        />
                        <button
                            type="button"
                            disabled={savingName}
                            onClick={handleSaveName}
                            className="rounded-lg bg-teal-500 p-1.5 text-white hover:bg-teal-600 disabled:opacity-50"
                            title="Salvar"
                        >
                            <Save size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setNameDraft(category.name);
                                setEditingName(false);
                            }}
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            title="Cancelar"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={toggleExpand}
                        className="flex flex-1 items-center gap-2 text-left"
                    >
                        <span className="font-semibold">{category.name}</span>
                        <Pencil
                            size={12}
                            className="text-zinc-400 hover:text-teal-500"
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditingName(true);
                            }}
                        />
                    </button>
                )}

                {isAdminMaster && !editingName && (
                    <button
                        type="button"
                        disabled={deleting}
                        onClick={handleDeleteList}
                        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                        title="Excluir lista definitivamente"
                    >
                        <Trash2 size={14} />
                    </button>
                )}

                <button
                    type="button"
                    onClick={toggleExpand}
                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                    {expanded ? (
                        <ChevronUp size={16} />
                    ) : (
                        <ChevronDown size={16} />
                    )}
                </button>
            </div>

            {expanded && (
                <div className="space-y-4 border-t border-zinc-100 dark:border-zinc-800 p-4">
                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                        <p className="mb-2 text-xs font-semibold text-zinc-500">
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
                                        className="h-9 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                    />
                                    <select
                                        value={selectedStockItemId}
                                        onChange={(e) =>
                                            setSelectedStockItemId(
                                                e.target.value,
                                            )
                                        }
                                        className="h-9 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                    >
                                        <option value="">
                                            {filteredStockOptions.length === 0
                                                ? 'Nenhum item encontrado'
                                                : 'Selecione o item...'}
                                        </option>
                                        {filteredStockOptions.map((item) => (
                                            <option
                                                key={item.id}
                                                value={item.id}
                                            >
                                                {item.nome}
                                                {item.categoria
                                                    ? ` (${item.categoria})`
                                                    : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={
                                            adding || !selectedStockItemId
                                        }
                                        onClick={handleAddFromStock}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-500 px-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
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
                                        className="h-9 flex-[2] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                    />
                                    <select
                                        value={manualUnidade}
                                        onChange={(e) =>
                                            setManualUnidade(
                                                e.target
                                                    .value as UnidadeMedida,
                                            )
                                        }
                                        className="h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                    >
                                        <option value="KG">kg</option>
                                        <option value="LITRO">L</option>
                                        <option value="UNIDADE">un</option>
                                    </select>
                                    <input
                                        value={manualQtd}
                                        onChange={(e) =>
                                            setManualQtd(e.target.value)
                                        }
                                        placeholder="Qtd sugerida"
                                        inputMode="decimal"
                                        className="h-9 w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                                    />
                                    <button
                                        type="button"
                                        disabled={adding}
                                        onClick={handleAddManual}
                                        className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-500 px-3 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
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

                    {loadingItems ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Carregando itens...
                        </p>
                    ) : items !== null ? (
                        items.length === 0 ? (
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Essa lista ainda não tem nenhum item —
                                adicione acima.
                            </p>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                                {items.map((item) => {
                                    const editing = editingQtd[item.id];

                                    return (
                                        <div
                                            key={item.id}
                                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                                        >
                                            <span className="text-sm font-medium">
                                                {item.descricao}
                                                {!item.stockItemId && (
                                                    <span className="ml-2 rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                                                        avulso
                                                    </span>
                                                )}
                                            </span>

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
                                                    className="h-8 w-20 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 text-sm font-semibold text-teal-600 dark:text-teal-400 outline-none focus:border-teal-500"
                                                />
                                                <span className="text-xs text-zinc-500">
                                                    {item.unidadeMedida ===
                                                        'KG'
                                                        ? 'kg'
                                                        : item.unidadeMedida ===
                                                            'LITRO'
                                                            ? 'L'
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
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemoveItem(
                                                            item.id,
                                                        )
                                                    }
                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                    title="Remover da lista"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : null}
                </div>
            )}
        </div>
    );
}

export function ListasTab() {
    const user = getUser();
    const store = getActiveStore();

    const [categories, setCategories] = useState<SupplierCategory[]>([]);
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
    const [loading, setLoading] = useState(true);

    const [novaLista, setNovaLista] = useState('');
    const [creating, setCreating] = useState(false);

    async function load() {
        if (!store) return;

        try {
            setLoading(true);
            const [categoriesRes, stockRes] = await Promise.all([
                api.get('/suppliers/categories'),
                api.get('/estoque/itens', { params: { storeId: store.id } }),
            ]);
            setCategories(categoriesRes.data || []);
            setStockItems(stockRes.data || []);
        } catch {
            toast.error('Erro ao carregar as listas');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleCreate() {
        const nome = novaLista.trim();
        if (!nome) {
            toast.error('Digite um nome pra nova lista');
            return;
        }

        try {
            setCreating(true);
            const response = await api.post('/suppliers/categories', {
                name: nome,
            });
            setCategories((current) =>
                [...current, response.data].sort((a, b) =>
                    a.name.localeCompare(b.name),
                ),
            );
            setNovaLista('');
            toast.success('Lista criada');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao criar a lista',
            );
        } finally {
            setCreating(false);
        }
    }

    function handleRenamed(id: string, name: string) {
        setCategories((current) =>
            current
                .map((c) => (c.id === id ? { ...c, name } : c))
                .sort((a, b) => a.name.localeCompare(b.name)),
        );
    }

    function handleDeleted(id: string) {
        setCategories((current) => current.filter((c) => c.id !== id));
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
                    <h2 className="text-lg font-bold">Listas</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Renomeie qualquer lista de cotação e ajuste os itens
                        dela a qualquer momento — sem precisar estar no dia
                        de mandar cotação.
                    </p>
                </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
                <input
                    value={novaLista}
                    onChange={(e) => setNovaLista(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate();
                    }}
                    placeholder="Nome de uma nova lista (ex: Padaria)"
                    className="h-10 flex-1 max-w-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-teal-500"
                />
                <button
                    type="button"
                    disabled={creating}
                    onClick={handleCreate}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                >
                    <Plus size={14} />
                    Nova lista
                </button>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando listas...
                </p>
            ) : categories.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma lista cadastrada ainda — crie a primeira acima.
                </p>
            ) : (
                <div className="space-y-3">
                    {categories.map((category) => (
                        <ListaCard
                            key={category.id}
                            category={category}
                            storeId={store.id}
                            isAdminMaster={Boolean(user?.isAdminMaster)}
                            stockItems={stockItems}
                            onRenamed={handleRenamed}
                            onDeleted={handleDeleted}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
