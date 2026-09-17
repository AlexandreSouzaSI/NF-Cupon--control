'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

type RecipeLine = {
    key: number;
    ingrediente: string;
    gramas: string;
};

let proximaChave = 1;

function linhaVazia(): RecipeLine {
    return { key: proximaChave++, ingrediente: '', gramas: '' };
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
    const [sugestoes, setSugestoes] = useState<string[]>([]);
    // Nome normalizado (maiúsculo/trim) -> unidade já configurada pro
    // ingrediente (ver aba Ingredientes) — só pra trocar o placeholder
    // do campo de quantidade (Gramas vs Unidades) e evitar confusão tipo
    // digitar "5" achando que é 5 coxinhas quando o sistema ainda lê
    // como peso.
    const [unidadePorIngrediente, setUnidadePorIngrediente] = useState<
        Record<string, 'KG' | 'UNIDADE'>
    >({});

    useEffect(() => {
        async function carregar() {
            try {
                setLoading(true);

                const [recipeRes, ingredientsRes] = await Promise.all([
                    api.get('/product-sales/recipe', { params: { storeId, produto } }),
                    api.get('/product-sales/ingredients', { params: { storeId } }),
                ]);

                const itens = Array.isArray(recipeRes.data) ? recipeRes.data : [];

                setLinhas(
                    itens.length > 0
                        ? itens.map((item: any) => ({
                            key: proximaChave++,
                            ingrediente: item.ingrediente,
                            gramas: String(item.gramas),
                        }))
                        : [linhaVazia()],
                );

                const ingredientesCadastrados = Array.isArray(ingredientsRes.data)
                    ? ingredientsRes.data
                    : [];

                setSugestoes(ingredientesCadastrados.map((i: any) => i.nome));

                const mapaUnidade: Record<string, 'KG' | 'UNIDADE'> = {};
                for (const ing of ingredientesCadastrados) {
                    mapaUnidade[String(ing.nome).trim().toUpperCase()] =
                        ing.unidadeMedida === 'UNIDADE' ? 'UNIDADE' : 'KG';
                }
                setUnidadePorIngrediente(mapaUnidade);
            } catch (error) {
                console.error(error);
                setLinhas([linhaVazia()]);
            } finally {
                setLoading(false);
            }
        }

        carregar();
    }, [storeId, produto]);

    function unidadeDaLinha(nomeIngrediente: string): 'KG' | 'UNIDADE' {
        return unidadePorIngrediente[nomeIngrediente.trim().toUpperCase()] || 'KG';
    }

    function atualizarLinha(key: number, campo: 'ingrediente' | 'gramas', valor: string) {
        setLinhas((atual) =>
            atual.map((linha) => (linha.key === key ? { ...linha, [campo]: valor } : linha)),
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
            .map((linha) => ({
                ingrediente: linha.ingrediente.trim(),
                gramas: Number(linha.gramas),
            }))
            .filter((item) => item.ingrediente && item.gramas > 0);

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
                            Filé 400g — cadastra os dois abaixo.
                        </p>

                        <datalist id="ingredientes-sugeridos">
                            {sugestoes.map((nome) => (
                                <option key={nome} value={nome} />
                            ))}
                        </datalist>

                        <div className="space-y-2">
                            {linhas.map((linha) => {
                                const unidade = unidadeDaLinha(linha.ingrediente);

                                return (
                                <div key={linha.key} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        list="ingredientes-sugeridos"
                                        value={linha.ingrediente}
                                        onChange={(e) =>
                                            atualizarLinha(linha.key, 'ingrediente', e.target.value)
                                        }
                                        placeholder="Ingrediente (ex: Contra Filé)"
                                        className="flex-1 rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-500 dark:border-zinc-700"
                                    />

                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={linha.gramas}
                                        onChange={(e) =>
                                            atualizarLinha(linha.key, 'gramas', e.target.value)
                                        }
                                        placeholder={unidade === 'UNIDADE' ? 'Unidades' : 'Gramas'}
                                        title={
                                            unidade === 'UNIDADE'
                                                ? 'Esse ingrediente está configurado "por unidade" — informe quantas unidades (ex: 2 coxinhas), não gramas.'
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
