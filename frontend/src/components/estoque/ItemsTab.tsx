'use client';

import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { getUser } from '@/lib/auth';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronUp,
    Loader2,
    Pencil,
    Plus,
    Search,
    Trash2,
    X,
} from 'lucide-react';

type UnidadeMedida = 'KG' | 'LITRO' | 'UNIDADE';

type StockItem = {
    id: string;
    nome: string;
    descricao: string | null;
    categoria: string | null;
    unidadeMedida: UnidadeMedida;
    quantidadeAtual: number;
    valorMedioUnitario: number | null;
    valorEstoque: number | null;
    negativo: boolean;
    estoqueMinimo: number | null;
    estoqueMaximo: number | null;
    abaixoDoMinimo: boolean;
    quantidadeSugerida: number;
    active: boolean;
    // Config usada pela Lista de Compra de Produtos (Venda/Lista) — vem
    // do mesmo StockItem, editada aqui via PUT /product-sales/ingredients/:id.
    isProteina?: boolean;
    porcaoPadraoGramas?: number | string | null;
    categoriaLista?: string | null;
    ordemLista?: number | null;
    pesoUnidadeGramas?: number | string | null;
};

function formatQtd(item: StockItem) {
    const numero = item.quantidadeAtual.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    if (item.unidadeMedida === 'KG') return `${numero} kg`;
    if (item.unidadeMedida === 'LITRO') return `${numero} L`;
    return `${numero} un`;
}

function formatMoeda(valor: number | null) {
    if (valor == null) return '—';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ItemsTab({ refreshKey }: { refreshKey?: number }) {
    const [items, setItems] = useState<StockItem[]>([]);
    const [categoriasFixas, setCategoriasFixas] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [onlyNegative, setOnlyNegative] = useState(false);
    const [categoriaFiltro, setCategoriaFiltro] = useState('');
    const [descricaoFiltro, setDescricaoFiltro] = useState('');

    const [showNew, setShowNew] = useState(false);
    const [novoNome, setNovoNome] = useState('');
    const [novaDescricao, setNovaDescricao] = useState('');
    const [novaCategoria, setNovaCategoria] = useState('');
    const [novaUnidade, setNovaUnidade] = useState<UnidadeMedida>('KG');
    const [novoMinimo, setNovoMinimo] = useState('');
    const [novoMaximo, setNovoMaximo] = useState('');
    const [salvandoNovo, setSalvandoNovo] = useState(false);

    const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
    const [unidadeEmMassa, setUnidadeEmMassa] = useState<UnidadeMedida>('KG');
    const [aplicandoEmMassa, setAplicandoEmMassa] = useState(false);

    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [formDescricao, setFormDescricao] = useState('');
    const [formCategoria, setFormCategoria] = useState('');
    const [formUnidade, setFormUnidade] = useState<UnidadeMedida>('KG');
    const [formMinimo, setFormMinimo] = useState('');
    const [formMaximo, setFormMaximo] = useState('');
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);

    // "Configurações de Lista de Compra" (usadas pelo módulo Venda/Lista
    // pra montar a Lista de Compra sugerida) — linha expansível por item,
    // separada da edição normal acima pra não poluir o fluxo mais comum.
    const [expandidoListaId, setExpandidoListaId] = useState<string | null>(null);
    const [formListaProteina, setFormListaProteina] = useState(false);
    const [formListaCategoria, setFormListaCategoria] = useState('');
    const [formListaOrdem, setFormListaOrdem] = useState('');
    const [formListaPorcaoPadrao, setFormListaPorcaoPadrao] = useState('');
    const [formListaPesoUnidade, setFormListaPesoUnidade] = useState('');
    const [salvandoLista, setSalvandoLista] = useState(false);

    // Excluir item é restrito — só Administrativo (ou Admin Master, que
    // passa por qualquer @Roles independente do perfil dele) mexe (apaga
    // em cascata todo o histórico de movimentação do item, é irreversível).
    const podeExcluir = (() => {
        const user = getUser();
        return Boolean(user?.isAdminMaster) || user?.role === 'ADMINISTRATIVO';
    })();

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [itemsRes, listaConfigRes, categoriasFixasRes] = await Promise.all([
                api.get('/estoque/itens', {
                    params: {
                        storeId: store.id,
                        search: search || undefined,
                        onlyNegative: onlyNegative || undefined,
                        categoria: categoriaFiltro || undefined,
                        descricao: descricaoFiltro || undefined,
                    },
                }),
                // Mesmo StockItem, mas esse endpoint devolve também os
                // campos usados pela Lista de Compra de Produtos
                // (isProteina, porcaoPadraoGramas, categoriaLista,
                // ordemLista, pesoUnidadeGramas) — /estoque/itens não traz
                // eles, então junta os dois por id.
                api.get('/product-sales/ingredients', { params: { storeId: store.id } }),
                api.get('/estoque/categorias-fixas'),
            ]);

            const configPorId = new Map<string, any>(
                (listaConfigRes.data || []).map((i: any) => [i.id, i]),
            );

            setItems(
                (itemsRes.data || []).map((item: StockItem) => {
                    const config = configPorId.get(item.id);
                    return {
                        ...item,
                        isProteina: config?.isProteina ?? false,
                        porcaoPadraoGramas: config?.porcaoPadraoGramas ?? null,
                        categoriaLista: config?.categoriaLista ?? null,
                        ordemLista: config?.ordemLista ?? null,
                        pesoUnidadeGramas: config?.pesoUnidadeGramas ?? null,
                    };
                }),
            );
            setCategoriasFixas(categoriasFixasRes.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, onlyNegative, categoriaFiltro]);

    useEffect(() => {
        const timeout = setTimeout(load, 350);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, descricaoFiltro]);

    async function criarItem() {
        const store = getActiveStore();
        if (!store || !novoNome.trim()) return;

        try {
            setSalvandoNovo(true);
            await api.post('/estoque/itens', {
                storeId: store.id,
                nome: novoNome.trim(),
                descricao: novaDescricao.trim() || undefined,
                categoria: novaCategoria.trim() || undefined,
                unidadeMedida: novaUnidade,
                estoqueMinimo: novoMinimo.trim() ? Number(novoMinimo.replace(',', '.')) : undefined,
                estoqueMaximo: novoMaximo.trim() ? Number(novoMaximo.replace(',', '.')) : undefined,
            });

            toast.success('Item criado.');
            setNovoNome('');
            setNovaDescricao('');
            setNovaCategoria('');
            setNovaUnidade('KG');
            setNovoMinimo('');
            setNovoMaximo('');
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
        setFormDescricao(item.descricao || '');
        setFormCategoria(item.categoria || '');
        setFormUnidade(item.unidadeMedida);
        setFormMinimo(item.estoqueMinimo != null ? String(item.estoqueMinimo) : '');
        setFormMaximo(item.estoqueMaximo != null ? String(item.estoqueMaximo) : '');
    }

    async function salvarEdicao(id: string) {
        try {
            setSalvandoEdicao(true);
            await api.patch(`/estoque/itens/${id}`, {
                descricao: formDescricao.trim() || null,
                categoria: formCategoria.trim() || null,
                unidadeMedida: formUnidade,
                estoqueMinimo: formMinimo.trim() ? Number(formMinimo.replace(',', '.')) : 0,
                estoqueMaximo: formMaximo.trim() ? Number(formMaximo.replace(',', '.')) : 0,
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

    function toggleConfigLista(item: StockItem) {
        if (expandidoListaId === item.id) {
            setExpandidoListaId(null);
            return;
        }

        setExpandidoListaId(item.id);
        setFormListaProteina(Boolean(item.isProteina));
        setFormListaCategoria(item.categoriaLista || '');
        setFormListaOrdem(item.ordemLista != null ? String(item.ordemLista) : '');
        setFormListaPorcaoPadrao(
            item.porcaoPadraoGramas != null && item.porcaoPadraoGramas !== ''
                ? String(item.porcaoPadraoGramas)
                : '',
        );
        setFormListaPesoUnidade(
            item.pesoUnidadeGramas != null && item.pesoUnidadeGramas !== ''
                ? String(item.pesoUnidadeGramas)
                : '',
        );
    }

    // Persiste a "Configuração de Lista de Compra" desse item — mesmo
    // StockItem, endpoint que já existia pro extinto "Ingrediente" e foi
    // migrado pra operar direto em cima do StockItem (ver comentário no
    // controller: PUT /product-sales/ingredients/:id).
    async function salvarConfigLista(id: string) {
        try {
            setSalvandoLista(true);
            await api.put(`/product-sales/ingredients/${id}`, {
                isProteina: formListaProteina,
                categoriaLista: formListaCategoria.trim() || null,
                ordemLista: formListaOrdem.trim() ? Number(formListaOrdem) : null,
                porcaoPadraoGramas: formListaPorcaoPadrao.trim()
                    ? Number(formListaPorcaoPadrao.replace(',', '.'))
                    : null,
                pesoUnidadeGramas: formListaPesoUnidade.trim()
                    ? Number(formListaPesoUnidade.replace(',', '.'))
                    : null,
            });

            toast.success('Configuração de lista de compra atualizada.');
            setExpandidoListaId(null);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao atualizar a configuração.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvandoLista(false);
        }
    }

    async function excluirItem(item: StockItem) {
        const confirmado = window.confirm(
            `Excluir "${item.nome}" de vez? Isso apaga também todo o histórico de movimentação desse item — não dá pra desfazer.`,
        );
        if (!confirmado) return;

        try {
            setExcluindoId(item.id);
            await api.delete(`/estoque/itens/${item.id}`);
            toast.success('Item excluído.');
            await load();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao excluir o item.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setExcluindoId(null);
        }
    }

    function toggleSelecionado(id: string) {
        setSelecionados((atual) => {
            const novo = new Set(atual);
            if (novo.has(id)) {
                novo.delete(id);
            } else {
                novo.add(id);
            }
            return novo;
        });
    }

    function toggleSelecionarTodos() {
        setSelecionados((atual) =>
            atual.size === items.length ? new Set() : new Set(items.map((i) => i.id)),
        );
    }

    async function aplicarUnidadeEmMassa() {
        if (selecionados.size === 0) return;

        const confirmado = window.confirm(
            `Trocar a unidade de medida de ${selecionados.size} item(ns) selecionado(s) para "${unidadeEmMassa === 'KG' ? 'KG' : unidadeEmMassa === 'LITRO' ? 'Litro' : 'Unidade'
            }"?`,
        );
        if (!confirmado) return;

        try {
            setAplicandoEmMassa(true);
            const { data } = await api.patch('/estoque/itens/bulk-unidade', {
                ids: Array.from(selecionados),
                unidadeMedida: unidadeEmMassa,
            });
            toast.success(`${data.atualizados} item(ns) atualizado(s).`);
            setSelecionados(new Set());
            await load();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao atualizar os itens.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setAplicandoEmMassa(false);
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

                <div className="min-w-[160px]">
                    <select
                        value={categoriaFiltro}
                        onChange={(e) => setCategoriaFiltro(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                    >
                        <option value="">Todas as categorias</option>
                        {categoriasFixas.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="relative min-w-[180px]">
                    <input
                        value={descricaoFiltro}
                        onChange={(e) => setDescricaoFiltro(e.target.value)}
                        placeholder="Filtrar por descrição..."
                        className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
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
                    <div className="flex-1 min-w-[160px]">
                        <label className="text-xs text-zinc-500">Nome</label>
                        <input
                            value={novoNome}
                            onChange={(e) => setNovoNome(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="text-xs text-zinc-500">Descrição (opcional)</label>
                        <input
                            value={novaDescricao}
                            onChange={(e) => setNovaDescricao(e.target.value)}
                            placeholder="Ex: Proteínas - Frigorífico"
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                    <div className="min-w-[160px]">
                        <label className="text-xs text-zinc-500">Categoria</label>
                        <select
                            value={novaCategoria}
                            onChange={(e) => setNovaCategoria(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        >
                            <option value="">Sem categoria</option>
                            {categoriasFixas.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-zinc-500">Unidade</label>
                        <select
                            value={novaUnidade}
                            onChange={(e) => setNovaUnidade(e.target.value as UnidadeMedida)}
                            className="mt-1 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        >
                            <option value="KG">KG</option>
                            <option value="LITRO">Litro</option>
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
                    <div className="w-28">
                        <label className="text-xs text-zinc-500">Máximo (opcional)</label>
                        <input
                            value={novoMaximo}
                            onChange={(e) => setNovoMaximo(e.target.value)}
                            inputMode="decimal"
                            placeholder="0"
                            title="Nível alvo — a sugestão de compra repõe até aqui, não só até o mínimo"
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

            {selecionados.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        {selecionados.size} item(ns) selecionado(s)
                    </span>
                    <select
                        value={unidadeEmMassa}
                        onChange={(e) => setUnidadeEmMassa(e.target.value as UnidadeMedida)}
                        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                    >
                        <option value="KG">KG</option>
                        <option value="LITRO">Litro</option>
                        <option value="UNIDADE">Unidade</option>
                    </select>
                    <button
                        onClick={aplicarUnidadeEmMassa}
                        disabled={aplicandoEmMassa}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                        {aplicandoEmMassa ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Aplicar unidade
                    </button>
                    <button
                        onClick={() => setSelecionados(new Set())}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        <X size={14} />
                        Limpar seleção
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
                                <th className="w-8 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={items.length > 0 && selecionados.size === items.length}
                                        onChange={toggleSelecionarTodos}
                                        className="accent-emerald-600"
                                        title="Selecionar todos"
                                    />
                                </th>
                                <th className="px-4 py-3 font-medium">Item</th>
                                <th className="px-4 py-3 font-medium">Descrição</th>
                                <th className="px-4 py-3 font-medium">Categoria</th>
                                <th className="px-4 py-3 text-right font-medium">Saldo</th>
                                <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                                <th className="px-4 py-3 text-right font-medium">Máximo</th>
                                <th className="px-4 py-3 text-right font-medium">Custo médio</th>
                                <th className="px-4 py-3 text-right font-medium">Valor em estoque</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {items.map((item) => {
                                const editando = editandoId === item.id;

                                return (
                                    <Fragment key={item.id}>
                                    <tr>
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selecionados.has(item.id)}
                                                onChange={() => toggleSelecionado(item.id)}
                                                className="accent-emerald-600"
                                            />
                                        </td>
                                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                            {item.nome}
                                            {item.isProteina && (
                                                <span className="ml-1.5 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                                                    PROTEÍNA
                                                </span>
                                            )}
                                            {item.categoriaLista && (
                                                <span className="ml-1.5 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                                                    {item.categoriaLista}
                                                </span>
                                            )}
                                        </td>

                                        {editando ? (
                                            <td colSpan={7} className="px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <input
                                                        value={formDescricao}
                                                        onChange={(e) => setFormDescricao(e.target.value)}
                                                        placeholder="Descrição"
                                                        className="w-44 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    />
                                                    <select
                                                        value={formCategoria}
                                                        onChange={(e) => setFormCategoria(e.target.value)}
                                                        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    >
                                                        <option value="">Sem categoria</option>
                                                        {categoriasFixas.map((c) => (
                                                            <option key={c} value={c}>
                                                                {c}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <select
                                                        value={formUnidade}
                                                        onChange={(e) => setFormUnidade(e.target.value as UnidadeMedida)}
                                                        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    >
                                                        <option value="KG">KG</option>
                                                        <option value="LITRO">Litro</option>
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
                                                    <input
                                                        value={formMaximo}
                                                        onChange={(e) => setFormMaximo(e.target.value)}
                                                        inputMode="decimal"
                                                        placeholder="Máximo"
                                                        title="Estoque máximo — nível alvo pra sugestão de compra"
                                                        className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    />
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
                                                <td className="px-4 py-3 text-zinc-500">{item.descricao || '—'}</td>
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
                                                <td className="px-4 py-3 text-right text-xs text-zinc-500">
                                                    {item.estoqueMaximo != null
                                                        ? item.estoqueMaximo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
                                                        : '—'}
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
                                                    <div className="inline-flex items-center gap-1">
                                                        <button
                                                            onClick={() => toggleConfigLista(item)}
                                                            title="Configurações de Lista de Compra (Venda/Lista)"
                                                            className={`rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                                                                expandidoListaId === item.id
                                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                                                            }`}
                                                        >
                                                            {expandidoListaId === item.id ? (
                                                                <ChevronUp size={14} />
                                                            ) : (
                                                                <ChevronDown size={14} />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => iniciarEdicao(item)}
                                                            title="Editar"
                                                            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                        >
                                                            <Pencil size={14} />
                                                        </button>
                                                        {podeExcluir && (
                                                            <button
                                                                onClick={() => excluirItem(item)}
                                                                disabled={excluindoId === item.id}
                                                                title="Excluir item (Administrativo)"
                                                                className="rounded-lg p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                                            >
                                                                {excluindoId === item.id ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (
                                                                    <Trash2 size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                    {expandidoListaId === item.id && (
                                        <tr>
                                        <td colSpan={10} className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/40">
                                            <div className="space-y-2">
                                                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                                    Configurações de Lista de Compra — &quot;{item.nome}&quot;
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    Usadas pelo módulo Venda/Lista pra montar a Lista de
                                                    Compra sugerida (Ficha Técnica dos pratos). Marque
                                                    &quot;Proteína&quot; nos cortes de carne ou itens
                                                    contados por unidade (Pastel, Coxinha, Costelinha...)
                                                    — só eles entram na sugestão.
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <label
                                                        title="Marca esse item como proteína/carne — só proteína (ou item por unidade) entra na Lista de Compra sugerida"
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={formListaProteina}
                                                            onChange={(e) => setFormListaProteina(e.target.checked)}
                                                            className="accent-emerald-600"
                                                        />
                                                        Proteína
                                                    </label>

                                                    <select
                                                        value={formListaCategoria}
                                                        onChange={(e) => setFormListaCategoria(e.target.value)}
                                                        title="Seção do pedido pro fornecedor, como o chefe de produção organiza a Lista de Compra."
                                                        className="rounded-lg border border-purple-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-purple-500/40"
                                                    >
                                                        <option value="">Sem categoria (Outros)</option>
                                                        <option value="Proteínas e Cortes">Proteínas e Cortes</option>
                                                        <option value="Feijoada">Feijoada</option>
                                                        <option value="Noite de petiscos">Noite de petiscos</option>
                                                    </select>

                                                    <input
                                                        type="number"
                                                        value={formListaOrdem}
                                                        onChange={(e) => setFormListaOrdem(e.target.value)}
                                                        placeholder="Ordem"
                                                        title="Posição desse item dentro da categoria na Lista de Compra (menor primeiro)."
                                                        className="w-20 rounded-lg border border-purple-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-purple-500/40"
                                                    />

                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={formListaPorcaoPadrao}
                                                        onChange={(e) => setFormListaPorcaoPadrao(e.target.value)}
                                                        placeholder="Porção padrão (g)"
                                                        title="Corte sempre porcionado nesse tamanho (ex: 200g). Gramaturas maiores viram múltiplos disso (400g = 2x 200g) e gramaturas menores ficam separadas (ex: Filé Mignon 100g do Kids)."
                                                        className="w-40 rounded-lg border border-amber-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-amber-500/40"
                                                    />

                                                    <input
                                                        type="number"
                                                        min={0}
                                                        step="0.01"
                                                        value={formListaPesoUnidade}
                                                        onChange={(e) => setFormListaPesoUnidade(e.target.value)}
                                                        placeholder="Peso da peça/pacote (g)"
                                                        title="Peso de uma peça/pacote inteiro (ex: picanha ~1200g, pacote de batata frita 400g) pra sugerir também 'quantas peças/pacotes' comprar."
                                                        className="w-44 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                    />

                                                    <button
                                                        onClick={() => salvarConfigLista(item.id)}
                                                        disabled={salvandoLista}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                    >
                                                        {salvandoLista ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Check size={14} />
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandidoListaId(null)}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                        </tr>
                                    )}
                                    </Fragment>
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
