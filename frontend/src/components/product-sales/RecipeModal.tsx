'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Factory, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { AutocompleteInput } from '../ui/AutocompleteInput';

type RecipeLine = {
    key: number;
    tipo: 'estoque' | 'producao';
    stockItemId: string;
    productionItemId: string;
    gramas: string;
};

type StockItemOption = {
    id: string;
    nome: string;
    unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
};

type ProductionItemOption = {
    id: string;
    nome: string;
    unidadeMedida: 'KG' | 'ML' | 'UNIDADE';
};

let proximaChave = 1;

function linhaVazia(): RecipeLine {
    return {
        key: proximaChave++,
        tipo: 'estoque',
        stockItemId: '',
        productionItemId: '',
        gramas: '',
    };
}

export function RecipeModal({
    storeId,
    produto,
    onClose,
    onSaved,
}: {
    storeId: string;
    produto: string;
    onClose: () => void;
    onSaved?: () => void;
}) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [linhas, setLinhas] = useState<RecipeLine[]>([]);
    const [itensEstoque, setItensEstoque] = useState<StockItemOption[]>([]);
    const [itensProducao, setItensProducao] = useState<ProductionItemOption[]>([]);

    useEffect(() => {
        async function carregar() {
            try {
                setLoading(true);

                const [recipeRes, estoqueRes, producaoRes] = await Promise.all([
                    api.get('/product-sales/recipe', { params: { storeId, produto } }),
                    api.get('/product-sales/ingredients', { params: { storeId } }),
                    api.get('/production/items', { params: { storeId } }),
                ]);

                const itens = Array.isArray(recipeRes.data) ? recipeRes.data : [];

                setLinhas(
                    itens.length > 0
                        ? itens.map((item: any) => ({
                            key: proximaChave++,
                            tipo: item.tipo === 'producao' ? 'producao' : 'estoque',
                            stockItemId: item.stockItemId || '',
                            productionItemId: item.productionItemId || '',
                            gramas: String(item.gramas),
                        }))
                        : [linhaVazia()],
                );

                const estoqueOpts: StockItemOption[] = Array.isArray(estoqueRes.data)
                    ? estoqueRes.data.map((i: any) => ({
                        id: i.id,
                        nome: i.nome,
                        unidadeMedida: i.unidadeMedida,
                    }))
                    : [];
                setItensEstoque(estoqueOpts);

                const producaoOpts: ProductionItemOption[] = Array.isArray(producaoRes.data)
                    ? producaoRes.data.map((p: any) => ({
                        id: p.id,
                        nome: p.nome,
                        unidadeMedida: p.unidadeMedida,
                    }))
                    : [];
                setItensProducao(producaoOpts);
            } catch (error) {
                console.error(error);
                setLinhas([linhaVazia()]);
            } finally {
                setLoading(false);
            }
        }

        carregar();
    }, [storeId, produto]);

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

    function selecionarEstoque(key: number, stockItemId: string) {
        setLinhas((atual) =>
            atual.map((linha) => (linha.key === key ? { ...linha, stockItemId } : linha)),
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

    async function handleSalvar() {
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
            setSaving(true);

            await api.put('/product-sales/recipe', {
                storeId,
                produto,
                itens: itensValidos,
            });

            toast.success('Ficha técnica salva.');
            onSaved?.();
            onClose();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar a ficha técnica.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-5 dark:bg-zinc-900">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-zinc-500">Ficha técnica</p>
                        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                            {produto}
                        </h3>
                    </div>

                    <button
                        onClick={onClose}
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={18} />
                    </button>
                </div>

                {loading ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                        Carregando...
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-zinc-500">
                            Ex: Chapa de Contra Filé leva Batata 400g e Contra
                            Filé 400g — cadastra os dois abaixo. Informe de
                            qual item do Estoque (ou pré-preparo de Produção)
                            vem cada ingrediente do prato.
                        </p>

                        <div className="space-y-2">
                            {linhas.map((linha) => {
                                if (linha.tipo === 'producao') {
                                    const item = itensProducao.find(
                                        (p) => p.id === linha.productionItemId,
                                    );

                                    return (
                                        <div key={linha.key} className="flex items-center gap-2">
                                            <div className="flex flex-1 items-center gap-2 rounded-xl border border-orange-400/60 bg-orange-500/5 px-2 py-1 dark:border-orange-500/40">
                                                <Factory
                                                    size={14}
                                                    className="shrink-0 text-orange-500"
                                                />
                                                <AutocompleteInput
                                                    options={itensProducao}
                                                    value={linha.productionItemId}
                                                    onChange={(id) =>
                                                        selecionarProducao(linha.key, id)
                                                    }
                                                    placeholder="Digite o nome do item de produção..."
                                                />
                                                <button
                                                    onClick={() => alternarParaEstoque(linha.key)}
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
                                                placeholder={
                                                    item?.unidadeMedida === 'UNIDADE'
                                                        ? 'Unidades'
                                                        : item?.unidadeMedida === 'ML'
                                                            ? 'ML'
                                                            : 'Gramas'
                                                }
                                                className="w-24 rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
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

                                const itemEstoque = itensEstoque.find(
                                    (i) => i.id === linha.stockItemId,
                                );
                                const unidade = itemEstoque?.unidadeMedida || 'KG';

                                return (
                                    <div key={linha.key} className="flex items-center gap-2">
                                        <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-transparent px-2 py-1 dark:border-zinc-700">
                                            <AutocompleteInput
                                                options={itensEstoque}
                                                value={linha.stockItemId}
                                                onChange={(id) => selecionarEstoque(linha.key, id)}
                                                placeholder="De qual item do Estoque vem isso?"
                                            />
                                            <button
                                                onClick={() => alternarParaProducao(linha.key)}
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
                                                unidade === 'UNIDADE'
                                                    ? 'Unidades'
                                                    : unidade === 'LITRO'
                                                      ? 'ML'
                                                      : 'Gramas'
                                            }
                                            title={
                                                unidade === 'UNIDADE'
                                                    ? 'Esse item está configurado "por unidade" — informe quantas unidades (ex: 2 coxinhas), não gramas.'
                                                    : unidade === 'LITRO'
                                                      ? 'Mililitros (volume)'
                                                      : 'Gramas (peso)'
                                            }
                                            className={`w-24 rounded-xl border bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 ${unidade === 'UNIDADE'
                                                ? 'border-amber-400/60 dark:border-amber-500/40'
                                                : 'border-zinc-200 dark:border-zinc-700'
                                                }`}
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
                        </div>

                        <button
                            onClick={adicionarLinha}
                            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                        >
                            <Plus size={16} />
                            Adicionar ingrediente
                        </button>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={onClose}
                                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>

                            <button
                                onClick={handleSalvar}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                                {saving && <Loader2 size={16} className="animate-spin" />}
                                Salvar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
