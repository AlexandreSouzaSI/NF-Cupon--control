'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import {
    Check,
    ChevronDown,
    ChevronUp,
    Factory,
    History,
    Loader2,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { AutocompleteInput } from '../ui/AutocompleteInput';

type ProductionUnidade = 'KG' | 'ML' | 'UNIDADE';

type StockItemOption = {
    id: string;
    nome: string;
    unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
};

type ReceitaComponente = {
    id?: string;
    stockItemId: string;
    stockItemNome?: string;
    stockItemUnidade?: string;
    quantidade: number;
};

type ProductionItem = {
    id: string;
    nome: string;
    unidadeMedida: ProductionUnidade;
    baseQuantidade: number;
    quantidadeAtual: number;
    receita: ReceitaComponente[];
};

type Movimentacao = {
    id: string;
    productionItemId: string;
    productionItemNome: string;
    unidadeMedida: ProductionUnidade;
    tipo: 'PRODUCAO' | 'CONSUMO_VENDA' | 'AJUSTE';
    quantidade: number;
    observacao: string | null;
    data: string;
};

function unidadeLabel(u: string) {
    if (u === 'KG') return 'kg';
    if (u === 'ML' || u === 'LITRO') return u === 'LITRO' ? 'L' : 'ml';
    return 'un';
}

function formatarQtd(qtd: number, unidade: string) {
    return `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unidadeLabel(unidade)}`;
}

type ReceitaLinha = { key: number; stockItemId: string; quantidade: string };

let nextKey = 1;

function linhaVazia(): ReceitaLinha {
    return { key: nextKey++, stockItemId: '', quantidade: '' };
}

export function ProductionTab({ refreshKey }: { refreshKey?: number }) {
    const [items, setItems] = useState<ProductionItem[]>([]);
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandido, setExpandido] = useState<string | null>(null);

    // Form de criação/edição
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [showNew, setShowNew] = useState(false);
    const [formNome, setFormNome] = useState('');
    const [formUnidade, setFormUnidade] = useState<ProductionUnidade>('KG');
    const [formReceita, setFormReceita] = useState<ReceitaLinha[]>([linhaVazia()]);
    const [salvando, setSalvando] = useState(false);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);

    // Produzir (2 passos: informar quantidade -> revisar consumo calculado -> confirmar)
    const [produzindoId, setProduzindoId] = useState<string | null>(null);
    const [etapaProducao, setEtapaProducao] = useState<'input' | 'revisao'>('input');
    const [produzirQtd, setProduzirQtd] = useState('');
    const [produzirObs, setProduzirObs] = useState('');
    const [salvandoProducao, setSalvandoProducao] = useState(false);

    // Histórico
    const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);
    const [historico, setHistorico] = useState<Movimentacao[]>([]);
    const [carregandoHistorico, setCarregandoHistorico] = useState(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [itemsRes, stockRes] = await Promise.all([
                api.get('/production/items', { params: { storeId: store.id } }),
                api.get('/estoque/itens', { params: { storeId: store.id } }),
            ]);

            setItems(itemsRes.data || []);
            setStockItems(
                (stockRes.data || []).map((i: any) => ({
                    id: i.id,
                    nome: i.nome,
                    unidadeMedida: i.unidadeMedida,
                })),
            );
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

    function resetForm() {
        setFormNome('');
        setFormUnidade('KG');
        setFormReceita([linhaVazia()]);
    }

    function abrirNovo() {
        resetForm();
        setEditandoId(null);
        setShowNew(true);
    }

    function abrirEdicao(item: ProductionItem) {
        // Normaliza pra "quantidade por 1 unidade produzida" — itens antigos
        // podem ter sido salvos com uma base diferente de 1; daqui pra
        // frente a base é sempre 1, escondida do usuário.
        const base = item.baseQuantidade || 1;

        setFormNome(item.nome);
        setFormUnidade(item.unidadeMedida);
        setFormReceita(
            item.receita.length
                ? item.receita.map((r) => ({
                      key: nextKey++,
                      stockItemId: r.stockItemId,
                      quantidade: String(r.quantidade / base),
                  }))
                : [linhaVazia()],
        );
        setEditandoId(item.id);
        setShowNew(false);
    }

    function cancelarForm() {
        setEditandoId(null);
        setShowNew(false);
        resetForm();
    }

    function addLinha() {
        setFormReceita((prev) => [...prev, linhaVazia()]);
    }

    function removeLinha(key: number) {
        setFormReceita((prev) => prev.filter((l) => l.key !== key));
    }

    function atualizarLinha(key: number, campo: 'stockItemId' | 'quantidade', valor: string) {
        setFormReceita((prev) =>
            prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)),
        );
    }

    async function salvar() {
        const store = getActiveStore();
        if (!store || !formNome.trim()) return;

        const receita = formReceita
            .filter((l) => l.stockItemId && l.quantidade)
            .map((l) => ({ stockItemId: l.stockItemId, quantidade: Number(l.quantidade) }));

        try {
            setSalvando(true);

            if (editandoId) {
                await api.patch(`/production/items/${editandoId}`, {
                    nome: formNome.trim(),
                    unidadeMedida: formUnidade,
                    baseQuantidade: 1,
                    receita,
                });
                toast.success('Item de produção atualizado.');
            } else {
                await api.post('/production/items', {
                    storeId: store.id,
                    nome: formNome.trim(),
                    unidadeMedida: formUnidade,
                    baseQuantidade: 1,
                    receita,
                });
                toast.success('Item de produção criado.');
            }

            cancelarForm();
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar o item de produção.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvando(false);
        }
    }

    async function excluir(id: string) {
        if (!confirm('Excluir este item de produção? Fichas técnicas que o usam podem parar de funcionar.')) {
            return;
        }

        try {
            setExcluindoId(id);
            await api.delete(`/production/items/${id}`);
            toast.success('Item de produção removido.');
            await load();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao excluir.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setExcluindoId(null);
        }
    }

    function abrirProduzir(item: ProductionItem) {
        setProduzindoId(item.id);
        setEtapaProducao('input');
        setProduzirQtd('');
        setProduzirObs('');
    }

    function revisarProduzir() {
        if (!produzirQtd || Number(produzirQtd) <= 0) {
            toast.error('Informe a quantidade produzida.');
            return;
        }
        setEtapaProducao('revisao');
    }

    async function confirmarProduzir(item: ProductionItem) {
        if (!produzirQtd || Number(produzirQtd) <= 0) {
            toast.error('Informe a quantidade produzida.');
            return;
        }

        try {
            setSalvandoProducao(true);
            await api.post(`/production/items/${item.id}/produzir`, {
                quantidade: Number(produzirQtd),
                observacao: produzirObs.trim() || undefined,
            });
            toast.success(
                `Produção registrada: ${produzirQtd} ${unidadeLabel(item.unidadeMedida)} de ${item.nome}.`,
            );
            setProduzindoId(null);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao registrar a produção.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvandoProducao(false);
        }
    }

    async function toggleHistorico(item: ProductionItem) {
        if (historicoAberto === item.id) {
            setHistoricoAberto(null);
            return;
        }

        const store = getActiveStore();
        if (!store) return;

        try {
            setCarregandoHistorico(true);
            setHistoricoAberto(item.id);
            const response = await api.get('/production/movimentacoes', {
                params: { storeId: store.id, productionItemId: item.id, pageSize: 20 },
            });
            setHistorico(response.data?.items || []);
        } catch (error) {
            console.error(error);
        } finally {
            setCarregandoHistorico(false);
        }
    }

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    const formAberto = showNew || Boolean(editandoId);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                        <Factory size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                            Produção (pré-preparo)
                        </p>
                        <p className="text-xs text-zinc-500">
                            Itens porcionados ou combinados a partir do Estoque bruto
                            (ex: Picanha 200g, Molho da Casa) — as fichas técnicas dos
                            pratos podem usar esses itens em vez do estoque bruto.
                        </p>
                    </div>
                </div>

                {!formAberto && (
                    <button
                        onClick={abrirNovo}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                        <Plus size={14} />
                        Novo item de produção
                    </button>
                )}
            </div>

            {formAberto && (
                <div className="space-y-4 rounded-2xl border border-orange-400/40 bg-white p-4 dark:border-orange-500/30 dark:bg-zinc-900">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {editandoId ? 'Editar item de produção' : 'Novo item de produção'}
                    </p>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-zinc-500">
                                Nome
                            </label>
                            <input
                                type="text"
                                value={formNome}
                                onChange={(e) => setFormNome(e.target.value)}
                                placeholder="Ex: Picanha 200g, Molho da Casa"
                                className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-zinc-500">
                                Unidade
                            </label>
                            <select
                                value={formUnidade}
                                onChange={(e) => setFormUnidade(e.target.value as ProductionUnidade)}
                                className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                            >
                                <option value="KG">Peso (KG)</option>
                                <option value="ML">Volume (ML)</option>
                                <option value="UNIDADE">Unidade</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-medium text-zinc-500">
                            De qual item do Estoque vem esse produto, e quanto se gasta pra
                            fazer 1 {unidadeLabel(formUnidade)}?
                        </label>
                        <p className="-mt-1 text-xs text-zinc-400">
                            Ex: pra cada 1 {unidadeLabel(formUnidade)} de &quot;
                            {formNome.trim() || 'Picanha 200g'}&quot;, gasta 0,2 kg de
                            Picanha bruta. O sistema multiplica isso pela quantidade
                            produzida na hora de registrar.
                        </p>

                        {formReceita.map((linha) => (
                            <div key={linha.key} className="flex flex-wrap items-center gap-2">
                                <AutocompleteInput
                                    options={stockItems.map((s) => ({
                                        id: s.id,
                                        nome: `${s.nome} (${unidadeLabel(s.unidadeMedida)})`,
                                    }))}
                                    value={linha.stockItemId}
                                    onChange={(id) =>
                                        atualizarLinha(linha.key, 'stockItemId', id)
                                    }
                                    placeholder="Selecione o item do estoque..."
                                    className="min-w-[220px] flex-1 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                />

                                <input
                                    type="number"
                                    min={0}
                                    step="0.001"
                                    value={linha.quantidade}
                                    onChange={(e) =>
                                        atualizarLinha(linha.key, 'quantidade', e.target.value)
                                    }
                                    placeholder={`Por 1 ${unidadeLabel(formUnidade)}`}
                                    className="w-32 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                />

                                <button
                                    onClick={() => removeLinha(linha.key)}
                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}

                        <button
                            onClick={addLinha}
                            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                        >
                            <Plus size={12} />
                            Adicionar componente
                        </button>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={salvar}
                            disabled={salvando || !formNome.trim()}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                            {salvando ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Check size={14} />
                            )}
                            Salvar
                        </button>
                        <button
                            onClick={cancelarForm}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                            <X size={14} />
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum item de produção cadastrado ainda. Crie um pra
                    registrar porcionamento ou combinação de itens do Estoque
                    (ex: Picanha 200g a partir da Picanha bruta em KG).
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) => {
                        const expandidoAqui = expandido === item.id;

                        return (
                            <div
                                key={item.id}
                                className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                                    <div
                                        className="flex-1 cursor-pointer"
                                        onClick={() => setExpandido(expandidoAqui ? null : item.id)}
                                    >
                                        <p className="font-medium text-zinc-900 dark:text-white">
                                            {item.nome}{' '}
                                            <span className="ml-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800">
                                                {unidadeLabel(item.unidadeMedida)}
                                            </span>
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            Estoque atual:{' '}
                                            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                                                {formatarQtd(item.quantidadeAtual, item.unidadeMedida)}
                                            </span>{' '}
                                            · {item.receita.length} componente(s) por 1{' '}
                                            {unidadeLabel(item.unidadeMedida)} produzida
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => abrirProduzir(item)}
                                            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                                        >
                                            <Factory size={14} />
                                            Produzir
                                        </button>
                                        <button
                                            onClick={() => toggleHistorico(item)}
                                            title="Histórico de movimentações"
                                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                        >
                                            <History size={16} />
                                        </button>
                                        <button
                                            onClick={() => abrirEdicao(item)}
                                            title="Editar"
                                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            onClick={() => excluir(item.id)}
                                            disabled={excluindoId === item.id}
                                            title="Excluir"
                                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-60"
                                        >
                                            {excluindoId === item.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                        </button>
                                        <span
                                            onClick={() => setExpandido(expandidoAqui ? null : item.id)}
                                            className="cursor-pointer text-zinc-400"
                                        >
                                            {expandidoAqui ? (
                                                <ChevronUp size={16} />
                                            ) : (
                                                <ChevronDown size={16} />
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {produzindoId === item.id && etapaProducao === 'input' && (
                                    <div className="mx-4 mb-4 space-y-2 rounded-xl border border-orange-400/40 bg-orange-500/5 p-3">
                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                            Registrar produção de &quot;{item.nome}&quot;
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <input
                                                type="number"
                                                min={0.001}
                                                step="0.001"
                                                value={produzirQtd}
                                                onChange={(e) => setProduzirQtd(e.target.value)}
                                                placeholder={`Quantidade produzida (${unidadeLabel(item.unidadeMedida)})`}
                                                className="w-56 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                            />
                                            <input
                                                type="text"
                                                value={produzirObs}
                                                onChange={(e) => setProduzirObs(e.target.value)}
                                                placeholder="Observação (opcional)"
                                                className="min-w-[180px] flex-1 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                            />
                                            <button
                                                onClick={revisarProduzir}
                                                className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => setProduzindoId(null)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {produzindoId === item.id && etapaProducao === 'revisao' && (
                                    <div className="mx-4 mb-4 space-y-2 rounded-xl border border-orange-400/40 bg-orange-500/5 p-3">
                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                                            Confirma {produzirQtd} {unidadeLabel(item.unidadeMedida)}{' '}
                                            de &quot;{item.nome}&quot;? Isso vai baixar do Estoque:
                                        </p>

                                        {item.receita.length === 0 ? (
                                            <p className="text-xs text-zinc-400">
                                                Esse item não tem componentes cadastrados — nada
                                                será abatido do Estoque, só soma ao saldo de
                                                Produção.
                                            </p>
                                        ) : (
                                            <div className="space-y-1 rounded-lg bg-white/60 p-2 dark:bg-black/20">
                                                {item.receita.map((r) => (
                                                    <div
                                                        key={r.id || r.stockItemId}
                                                        className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300"
                                                    >
                                                        <span>{r.stockItemNome}</span>
                                                        <span className="font-semibold text-orange-600 dark:text-orange-400">
                                                            {formatarQtd(
                                                                r.quantidade * Number(produzirQtd || 0),
                                                                r.stockItemUnidade || 'KG',
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={() => confirmarProduzir(item)}
                                                disabled={salvandoProducao}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                            >
                                                {salvandoProducao ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Check size={14} />
                                                )}
                                                Sim, confirmar
                                            </button>
                                            <button
                                                onClick={() => setEtapaProducao('input')}
                                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                            >
                                                <X size={14} />
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {expandidoAqui && (
                                    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                                        {item.receita.length === 0 ? (
                                            <p className="text-xs text-zinc-400">
                                                Sem receita cadastrada ainda — edite o item pra
                                                adicionar os componentes do Estoque.
                                            </p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {item.receita.map((r) => (
                                                    <div
                                                        key={r.id || r.stockItemId}
                                                        className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300"
                                                    >
                                                        <span>{r.stockItemNome}</span>
                                                        <span className="font-medium">
                                                            {formatarQtd(
                                                                r.quantidade,
                                                                r.stockItemUnidade || 'KG',
                                                            )}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {historicoAberto === item.id && (
                                    <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                                        <p className="mb-2 text-xs font-semibold text-zinc-500">
                                            Últimas movimentações
                                        </p>
                                        {carregandoHistorico ? (
                                            <p className="text-xs text-zinc-400">Carregando...</p>
                                        ) : historico.length === 0 ? (
                                            <p className="text-xs text-zinc-400">
                                                Nenhuma movimentação ainda.
                                            </p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {historico.map((m) => (
                                                    <div
                                                        key={m.id}
                                                        className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300"
                                                    >
                                                        <span>
                                                            {new Date(m.data).toLocaleDateString('pt-BR')}{' '}
                                                            <span className="ml-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800">
                                                                {m.tipo === 'PRODUCAO'
                                                                    ? 'Produção'
                                                                    : m.tipo === 'CONSUMO_VENDA'
                                                                      ? 'Consumo (venda)'
                                                                      : 'Ajuste'}
                                                            </span>
                                                            {m.observacao ? ` — ${m.observacao}` : ''}
                                                        </span>
                                                        <span
                                                            className={
                                                                m.tipo === 'PRODUCAO'
                                                                    ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                                                                    : 'font-semibold text-red-500'
                                                            }
                                                        >
                                                            {m.tipo === 'PRODUCAO' ? '+' : '-'}
                                                            {formatarQtd(m.quantidade, m.unidadeMedida)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
