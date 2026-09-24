'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import {
    Check,
    ChefHat,
    Factory,
    Loader2,
    Plus,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { AutocompleteInput } from './AutocompleteInput';

type ItemOverview = {
    tipo: 'estoque' | 'producao';
    nome: string;
    gramas: number;
    productionItemId: string | null;
};

type PratoOverview = {
    produto: string;
    produtoChave: string;
    itens: ItemOverview[];
};

type StockItemOption = { id: string; nome: string; unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE' };
type ProductionItemOption = { id: string; nome: string; unidadeMedida: 'KG' | 'ML' | 'UNIDADE' };

type LinhaEdicao = {
    key: number;
    tipo: 'estoque' | 'producao';
    stockItemId: string;
    productionItemId: string;
    gramas: string;
};

let proximaChave = 1;

function linhaVazia(): LinhaEdicao {
    return {
        key: proximaChave++,
        tipo: 'estoque',
        stockItemId: '',
        productionItemId: '',
        gramas: '',
    };
}

function normalizar(nome: string) {
    return nome.trim().toUpperCase();
}

export function FichaTecnicaTab({ refreshKey }: { refreshKey?: number }) {
    const [pratos, setPratos] = useState<PratoOverview[]>([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [somenteSemIngredientes, setSomenteSemIngredientes] = useState(false);
    const [estoqueItens, setEstoqueItens] = useState<StockItemOption[]>([]);
    const [producaoItens, setProducaoItens] = useState<ProductionItemOption[]>([]);
    const [estoquePorNome, setEstoquePorNome] = useState<Record<string, StockItemOption>>({});

    const [editandoChave, setEditandoChave] = useState<string | null>(null);
    const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
    const [salvando, setSalvando] = useState(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [overviewRes, estoqueRes, producaoRes] = await Promise.all([
                api.get('/product-sales/recipes-overview', { params: { storeId: store.id } }),
                api.get('/product-sales/ingredients', { params: { storeId: store.id } }),
                api.get('/production/items', { params: { storeId: store.id } }),
            ]);

            setPratos(overviewRes.data || []);

            const estoqueOpts: StockItemOption[] = (estoqueRes.data || []).map((i: any) => ({
                id: i.id,
                nome: i.nome,
                unidadeMedida: i.unidadeMedida,
            }));
            setEstoqueItens(estoqueOpts);

            const producaoOpts: ProductionItemOption[] = (producaoRes.data || []).map(
                (p: any) => ({ id: p.id, nome: p.nome, unidadeMedida: p.unidadeMedida }),
            );
            setProducaoItens(producaoOpts);

            const mapaEstoque: Record<string, StockItemOption> = {};
            for (const i of estoqueOpts) {
                mapaEstoque[normalizar(i.nome)] = i;
            }
            setEstoquePorNome(mapaEstoque);
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

    const totalSemIngredientes = useMemo(
        () => pratos.filter((p) => p.itens.length === 0).length,
        [pratos],
    );

    const pratosFiltrados = useMemo(() => {
        const termo = normalizar(busca);
        let lista = pratos;

        if (somenteSemIngredientes) {
            lista = lista.filter((p) => p.itens.length === 0);
        }

        if (termo) {
            lista = lista.filter((p) => normalizar(p.produto).includes(termo));
        }

        return lista;
    }, [pratos, busca, somenteSemIngredientes]);

    function iniciarEdicao(prato: PratoOverview) {
        setEditandoChave(prato.produtoChave);
        setLinhas(
            prato.itens.length > 0
                ? prato.itens.map((item) => ({
                      key: proximaChave++,
                      tipo: item.tipo,
                      stockItemId:
                          item.tipo === 'estoque'
                              ? estoquePorNome[normalizar(item.nome)]?.id || ''
                              : '',
                      productionItemId: item.tipo === 'producao' ? item.productionItemId || '' : '',
                      gramas: String(item.gramas),
                  }))
                : [linhaVazia()],
        );
    }

    function cancelarEdicao() {
        setEditandoChave(null);
        setLinhas([]);
    }

    function selecionarEstoque(key: number, stockItemId: string) {
        setLinhas((atual) =>
            atual.map((linha) =>
                linha.key === key ? { ...linha, tipo: 'estoque', stockItemId, productionItemId: '' } : linha,
            ),
        );
    }

    function atualizarGramas(key: number, valor: string) {
        setLinhas((atual) =>
            atual.map((linha) => (linha.key === key ? { ...linha, gramas: valor } : linha)),
        );
    }

    function alternarParaEstoque(key: number) {
        setLinhas((atual) =>
            atual.map((linha) =>
                linha.key === key
                    ? { ...linha, tipo: 'estoque', productionItemId: '', stockItemId: '' }
                    : linha,
            ),
        );
    }

    function alternarParaProducao(key: number) {
        setLinhas((atual) =>
            atual.map((linha) =>
                linha.key === key
                    ? { ...linha, tipo: 'producao', stockItemId: '', productionItemId: '' }
                    : linha,
            ),
        );
    }

    function selecionarProducao(key: number, productionItemId: string) {
        setLinhas((atual) =>
            atual.map((linha) =>
                linha.key === key ? { ...linha, tipo: 'producao', productionItemId } : linha,
            ),
        );
    }

    function removerLinha(key: number) {
        setLinhas((atual) => atual.filter((linha) => linha.key !== key));
    }

    function adicionarLinha() {
        setLinhas((atual) => [...atual, linhaVazia()]);
    }

    async function salvar(prato: PratoOverview) {
        const store = getActiveStore();
        if (!store) return;

        const itensValidos = linhas
            .map((linha) => {
                const gramas = Number(linha.gramas);

                if (linha.tipo === 'producao') {
                    return linha.productionItemId && gramas > 0
                        ? { productionItemId: linha.productionItemId, gramas }
                        : null;
                }

                return linha.stockItemId && gramas > 0
                    ? { stockItemId: linha.stockItemId, gramas }
                    : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

        try {
            setSalvando(true);

            await api.put('/product-sales/recipe', {
                storeId: store.id,
                produto: prato.produto,
                itens: itensValidos,
            });

            toast.success('Ficha técnica salva.');
            setEditandoChave(null);
            setLinhas([]);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar a ficha técnica.';
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
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ChefHat size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                            Ficha Técnica
                        </p>
                        <p className="text-xs text-zinc-500">
                            Todos os pratos da loja numa lista só — clique em um prato
                            pra configurar os ingredientes dele. Escolha diretamente de
                            qual item do Estoque (ou pré-preparo de Produção) vem cada
                            ingrediente.
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setSomenteSemIngredientes((v) => !v)}
                        title="Mostrar só os pratos que ainda não têm nenhum ingrediente configurado"
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            somenteSemIngredientes
                                ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                        }`}
                    >
                        Sem ingredientes ({totalSemIngredientes})
                    </button>

                    <div className="relative w-full max-w-xs">
                        <Search
                            size={14}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
                        />
                        <input
                            type="text"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            placeholder="Buscar prato..."
                            className="w-full rounded-lg border border-zinc-200 bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                        />
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : pratosFiltrados.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    {somenteSemIngredientes
                        ? 'Nenhum prato sem ingredientes — tudo configurado por aqui.'
                        : 'Nenhum prato encontrado.'}
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {pratosFiltrados.map((prato) => {
                            const editando = editandoChave === prato.produtoChave;

                            return (
                                <div key={prato.produtoChave} className="p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-[200px]">
                                            <p className="font-medium text-zinc-900 dark:text-white">
                                                {prato.produto}
                                            </p>
                                            {!editando && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    {prato.itens.length === 0 ? (
                                                        <span className="text-xs text-zinc-400">
                                                            Sem ingredientes cadastrados
                                                        </span>
                                                    ) : (
                                                        prato.itens.map((item, idx) => (
                                                            <span
                                                                key={`${item.nome}-${idx}`}
                                                                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                                                                    item.tipo === 'producao'
                                                                        ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                                                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                                                                }`}
                                                            >
                                                                {item.tipo === 'producao' && (
                                                                    <Factory size={10} />
                                                                )}
                                                                {item.nome} ({item.gramas})
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {!editando && (
                                            <button
                                                onClick={() => iniciarEdicao(prato)}
                                                className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                            >
                                                Configurar
                                            </button>
                                        )}
                                    </div>

                                    {editando && (
                                        <div className="mt-3 space-y-2 rounded-xl border border-emerald-400/40 bg-emerald-500/5 p-3">
                                            {linhas.map((linha) => {
                                                if (linha.tipo === 'producao') {
                                                    return (
                                                        <div
                                                            key={linha.key}
                                                            className="flex items-center gap-2"
                                                        >
                                                            <div className="flex flex-1 items-center gap-2 rounded-lg border border-orange-400/60 bg-orange-500/5 px-2 py-1 dark:border-orange-500/40">
                                                                <Factory
                                                                    size={14}
                                                                    className="shrink-0 text-orange-500"
                                                                />
                                                                <AutocompleteInput
                                                                    options={producaoItens}
                                                                    value={linha.productionItemId}
                                                                    onChange={(id) =>
                                                                        selecionarProducao(
                                                                            linha.key,
                                                                            id,
                                                                        )
                                                                    }
                                                                    placeholder="Digite o nome do item de produção..."
                                                                />
                                                                <button
                                                                    onClick={() =>
                                                                        alternarParaEstoque(linha.key)
                                                                    }
                                                                    title="Usar item do Estoque em vez de Produção"
                                                                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 hover:bg-orange-500/10 dark:text-orange-400"
                                                                >
                                                                    Estoque
                                                                </button>
                                                            </div>

                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={linha.gramas}
                                                                onChange={(e) =>
                                                                    atualizarGramas(linha.key, e.target.value)
                                                                }
                                                                placeholder="Qtd"
                                                                className="w-24 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                            />

                                                            <button
                                                                onClick={() => removerLinha(linha.key)}
                                                                title="Remover"
                                                                className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    );
                                                }

                                                const itemEstoque = estoqueItens.find(
                                                    (i) => i.id === linha.stockItemId,
                                                );
                                                const unidade = itemEstoque?.unidadeMedida || 'KG';

                                                return (
                                                    <div
                                                        key={linha.key}
                                                        className="flex items-center gap-2"
                                                    >
                                                        <div className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 dark:border-zinc-700">
                                                            <AutocompleteInput
                                                                options={estoqueItens}
                                                                value={linha.stockItemId}
                                                                onChange={(id) =>
                                                                    selecionarEstoque(
                                                                        linha.key,
                                                                        id,
                                                                    )
                                                                }
                                                                placeholder="De qual item do Estoque vem isso?"
                                                            />
                                                            <button
                                                                onClick={() =>
                                                                    alternarParaProducao(linha.key)
                                                                }
                                                                title="Usar item de Produção (pré-preparo) em vez do Estoque bruto"
                                                                className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                            >
                                                                Produção
                                                            </button>
                                                        </div>

                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="0.01"
                                                            value={linha.gramas}
                                                            onChange={(e) =>
                                                                atualizarGramas(linha.key, e.target.value)
                                                            }
                                                            placeholder={
                                                                unidade === 'LITRO'
                                                                    ? 'ML'
                                                                    : unidade === 'UNIDADE'
                                                                      ? 'Unidades'
                                                                      : 'Gramas'
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                        />

                                                        <button
                                                            onClick={() => removerLinha(linha.key)}
                                                            title="Remover"
                                                            className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                );
                                            })}

                                            <div className="flex items-center justify-between gap-2 pt-1">
                                                <button
                                                    onClick={adicionarLinha}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-300"
                                                >
                                                    <Plus size={12} />
                                                    Adicionar ingrediente
                                                </button>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={cancelarEdicao}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={14} />
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => salvar(prato)}
                                                        disabled={salvando}
                                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                    >
                                                        {salvando ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Check size={14} />
                                                        )}
                                                        Salvar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
