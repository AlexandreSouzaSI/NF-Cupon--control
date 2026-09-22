'use client';

import { Fragment, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Check,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Loader2,
    Pencil,
    Scale,
    UtensilsCrossed,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

type UnidadeMedida = 'KG' | 'UNIDADE';

type PratoConsumo = {
    produto: string;
    quantidadeVendida: number;
    quantidade: number;
};

type IngredienteConsumo = {
    ingredienteId: string;
    ingrediente: string;
    unidadeMedida: UnidadeMedida;
    pesoUnidadeGramas: number | null;
    isProteina: boolean;
    porcaoPadraoGramas: number | null;
    categoriaLista: string | null;
    ordemLista: number | null;
    quantidade: number;
    totalKg: number;
    unidadesEquivalentes: number | null;
    pratos: PratoConsumo[];
};

type IngredientsSummary = {
    totalIngredientes: number;
    totalKg: number;
    ingredientes: IngredienteConsumo[];
};

// Ingrediente cru como vem de GET /product-sales/ingredients (todos os
// já cadastrados na loja, com ou sem consumo apurado — Decimal serializa
// como string, por isso Number(...) na hora de usar).
type IngredientRaw = {
    id: string;
    nome: string;
    unidadeMedida: UnidadeMedida;
    pesoUnidadeGramas: string | number | null;
    isProteina: boolean;
    porcaoPadraoGramas: string | number | null;
    categoriaLista: string | null;
    ordemLista: number | null;
};

function formatarKg(valor: number) {
    return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}

function formatarNumero(valor: number) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatarUnidades(valor: number) {
    return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un`;
}

// Formata a quantidade total de um ingrediente respeitando o tipo:
// UNIDADE mostra direto em unidades; KG mostra em kg e, se tiver peso
// de peça/pacote configurado, complementa com "≈ N peça(s)".
function formatarQuantidadeIngrediente(item: IngredienteConsumo) {
    if (item.unidadeMedida === 'UNIDADE') {
        return formatarUnidades(item.quantidade);
    }

    if (item.unidadesEquivalentes != null) {
        return `${formatarKg(item.quantidade)} (≈ ${item.unidadesEquivalentes} pç)`;
    }

    return formatarKg(item.quantidade);
}

export function IngredientsTab({
    refreshKey,
    importId,
}: {
    refreshKey?: number;
    importId?: string | null;
}) {
    const [dados, setDados] = useState<IngredientsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandido, setExpandido] = useState<string | null>(null);

    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [formUnidade, setFormUnidade] = useState<UnidadeMedida>('KG');
    const [formPeso, setFormPeso] = useState('');
    const [formProteina, setFormProteina] = useState(false);
    const [formPorcaoPadrao, setFormPorcaoPadrao] = useState('');
    const [formCategoria, setFormCategoria] = useState('');
    const [formOrdem, setFormOrdem] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [importandoPadrao, setImportandoPadrao] = useState(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);

            // Junta os DOIS: ingredients-summary só traz quem já teve
            // consumo apurado no recorte atual; ingredients traz TODOS os
            // já cadastrados na loja (inclusive os recém-criados pelo
            // botão "Importar lista padrão", que ainda não têm receita
            // vinculada) — sem isso, um ingrediente novo sem venda ainda
            // ficaria invisível e impossível de configurar aqui.
            const [summaryResponse, allResponse] = await Promise.all([
                api.get('/product-sales/ingredients-summary', {
                    params: { storeId: store.id, importId: importId || undefined },
                }),
                api.get('/product-sales/ingredients', {
                    params: { storeId: store.id },
                }),
            ]);

            const summary: IngredientsSummary = summaryResponse.data;
            const todos: IngredientRaw[] = allResponse.data || [];

            const jaListados = new Set(summary.ingredientes.map((i) => i.ingredienteId));

            const semConsumo: IngredienteConsumo[] = todos
                .filter((raw) => !jaListados.has(raw.id))
                .map((raw) => ({
                    ingredienteId: raw.id,
                    ingrediente: raw.nome,
                    unidadeMedida: raw.unidadeMedida,
                    pesoUnidadeGramas:
                        raw.pesoUnidadeGramas != null ? Number(raw.pesoUnidadeGramas) : null,
                    isProteina: raw.isProteina,
                    porcaoPadraoGramas:
                        raw.porcaoPadraoGramas != null ? Number(raw.porcaoPadraoGramas) : null,
                    categoriaLista: raw.categoriaLista,
                    ordemLista: raw.ordemLista,
                    quantidade: 0,
                    totalKg: 0,
                    unidadesEquivalentes: null,
                    pratos: [],
                }))
                .sort((a, b) => a.ingrediente.localeCompare(b.ingrediente, 'pt-BR'));

            const categoriaPorId = new Map(
                todos.map((raw) => [raw.id, { categoriaLista: raw.categoriaLista, ordemLista: raw.ordemLista }]),
            );

            setDados({
                totalIngredientes: summary.totalIngredientes + semConsumo.length,
                totalKg: summary.totalKg,
                ingredientes: [
                    ...summary.ingredientes.map((item) => ({
                        ...item,
                        categoriaLista: categoriaPorId.get(item.ingredienteId)?.categoriaLista ?? null,
                        ordemLista: categoriaPorId.get(item.ingredienteId)?.ordemLista ?? null,
                    })),
                    ...semConsumo,
                ],
            });
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, importId]);

    async function importarListaPadrao() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setImportandoPadrao(true);

            const response = await api.post(
                '/product-sales/ingredients/import-lista-padrao',
                { storeId: store.id },
            );

            toast.success(
                `${response.data?.totalImportado ?? 0} ingrediente(s) da lista padrão criado(s)/ajustado(s).`,
            );
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao importar a lista padrão.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setImportandoPadrao(false);
        }
    }

    function iniciarEdicao(item: IngredienteConsumo) {
        setEditandoId(item.ingredienteId);
        setFormUnidade(item.unidadeMedida);
        setFormPeso(item.pesoUnidadeGramas ? String(item.pesoUnidadeGramas) : '');
        setFormProteina(item.isProteina);
        setFormPorcaoPadrao(
            item.porcaoPadraoGramas ? String(item.porcaoPadraoGramas) : '',
        );
        setFormCategoria(item.categoriaLista || '');
        setFormOrdem(item.ordemLista != null ? String(item.ordemLista) : '');
    }

    function cancelarEdicao() {
        setEditandoId(null);
    }

    async function salvarEdicao(ingredienteId: string) {
        try {
            setSalvando(true);

            await api.put(`/product-sales/ingredients/${ingredienteId}`, {
                unidadeMedida: formUnidade,
                pesoUnidadeGramas:
                    formUnidade === 'KG' && formPeso ? Number(formPeso) : null,
                isProteina: formProteina,
                porcaoPadraoGramas:
                    formUnidade === 'KG' && formPorcaoPadrao
                        ? Number(formPorcaoPadrao)
                        : null,
                categoriaLista: formCategoria.trim() || null,
                ordemLista: formOrdem !== '' ? Number(formOrdem) : null,
            });

            toast.success('Ingrediente atualizado.');
            setEditandoId(null);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao atualizar o ingrediente.';
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                        <Scale size={18} />
                    </div>
                    <p className="text-xs text-zinc-500">Ingredientes cadastrados</p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                        {loading ? '...' : dados?.totalIngredientes ?? 0}
                    </p>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Scale size={18} />
                    </div>
                    <p className="text-xs text-zinc-500">
                        Total consumido em KG (ingredientes por peso)
                    </p>
                    <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">
                        {loading ? '...' : formatarKg(dados?.totalKg ?? 0)}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">
                    Cria/ajusta de uma vez os ingredientes da lista padrão do
                    chefe de produção (Proteínas e Cortes, Feijoada, Noite de
                    petiscos), já marcados como proteína e na categoria/ordem
                    certas — não duplica quem já existir.
                </p>

                <button
                    onClick={importarListaPadrao}
                    disabled={importandoPadrao}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                    {importandoPadrao ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <ClipboardList size={14} />
                    )}
                    Importar lista padrão
                </button>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : !dados || dados.ingredientes.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum ingrediente cadastrado ainda — configure a ficha
                    técnica dos pratos na aba &quot;Produtos&quot; (botão
                    &quot;Configurar&quot; em cada item) pra ver o consumo de
                    cada ingrediente aqui, ou use o botão &quot;Importar lista
                    padrão&quot; acima pra já criar os itens da lista do
                    chefe de produção.
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                <th className="px-4 py-3 font-medium">Ingrediente</th>
                                <th className="px-4 py-3 text-right font-medium">Pratos que usam</th>
                                <th className="px-4 py-3 text-right font-medium">Total consumido</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                            {dados.ingredientes.map((item) => {
                                const aberto = expandido === item.ingredienteId;
                                const editando = editandoId === item.ingredienteId;

                                return (
                                    <Fragment key={item.ingredienteId}>
                                        <tr
                                            className={
                                                editando
                                                    ? ''
                                                    : 'cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                                            }
                                        >
                                            <td
                                                className="px-4 py-3 font-medium text-zinc-900 dark:text-white"
                                                onClick={() =>
                                                    !editando &&
                                                    setExpandido(aberto ? null : item.ingredienteId)
                                                }
                                            >
                                                {item.ingrediente}{' '}
                                                <span className="ml-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800">
                                                    {item.unidadeMedida === 'UNIDADE' ? 'UN' : 'KG'}
                                                </span>
                                                {item.isProteina && (
                                                    <span className="ml-1 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                                                        PROTEÍNA
                                                    </span>
                                                )}
                                                {item.categoriaLista && (
                                                    <span className="ml-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                                                        {item.categoriaLista}
                                                    </span>
                                                )}
                                            </td>

                                            {editando ? (
                                                <td colSpan={3} className="px-4 py-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <select
                                                            value={formUnidade}
                                                            onChange={(e) =>
                                                                setFormUnidade(e.target.value as UnidadeMedida)
                                                            }
                                                            className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                        >
                                                            <option value="KG">Por peso (KG)</option>
                                                            <option value="UNIDADE">Por unidade</option>
                                                        </select>

                                                        {formUnidade === 'KG' && (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={formPeso}
                                                                onChange={(e) => setFormPeso(e.target.value)}
                                                                placeholder="Peso da peça/pacote (g)"
                                                                className="w-44 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                            />
                                                        )}

                                                        {formUnidade === 'KG' && (
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={formPorcaoPadrao}
                                                                onChange={(e) =>
                                                                    setFormPorcaoPadrao(e.target.value)
                                                                }
                                                                placeholder="Porção padrão (g)"
                                                                title="Corte sempre porcionado nesse tamanho (ex: 200g). Na visão Tamanho da Lista de Compra, gramaturas maiores viram múltiplos disso (400g = 2x 200g) e gramaturas menores ficam separadas (ex: Filé Mignon 100g do Kids)."
                                                                className="w-40 rounded-lg border border-amber-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-amber-500/40"
                                                            />
                                                        )}

                                                        <select
                                                            value={formCategoria}
                                                            onChange={(e) => setFormCategoria(e.target.value)}
                                                            title="Seção do pedido pro fornecedor, como o chefe de produção organiza a Lista de Compra."
                                                            className="rounded-lg border border-purple-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-purple-500/40"
                                                        >
                                                            <option value="">Sem categoria (Outros)</option>
                                                            <option value="Proteínas e Cortes">
                                                                Proteínas e Cortes
                                                            </option>
                                                            <option value="Feijoada">Feijoada</option>
                                                            <option value="Noite de petiscos">
                                                                Noite de petiscos
                                                            </option>
                                                        </select>

                                                        <input
                                                            type="number"
                                                            value={formOrdem}
                                                            onChange={(e) => setFormOrdem(e.target.value)}
                                                            placeholder="Ordem"
                                                            title="Posição desse item dentro da categoria na Lista de Compra (menor primeiro)."
                                                            className="w-20 rounded-lg border border-purple-400/60 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-purple-500/40"
                                                        />

                                                        <label
                                                            title="Marca esse ingrediente como proteína/carne — só proteína (ou item por unidade, tipo Pastel/Coxinha) entra na Lista de Compra."
                                                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={formProteina}
                                                                onChange={(e) => setFormProteina(e.target.checked)}
                                                                className="accent-emerald-600"
                                                            />
                                                            Proteína
                                                        </label>

                                                        <button
                                                            onClick={() => salvarEdicao(item.ingredienteId)}
                                                            disabled={salvando}
                                                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                        >
                                                            {salvando ? (
                                                                <Loader2 size={14} className="animate-spin" />
                                                            ) : (
                                                                <Check size={14} />
                                                            )}
                                                        </button>

                                                        <button
                                                            onClick={cancelarEdicao}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            ) : (
                                                <>
                                                    <td
                                                        className="px-4 py-3 text-right text-zinc-500"
                                                        onClick={() =>
                                                            setExpandido(aberto ? null : item.ingredienteId)
                                                        }
                                                    >
                                                        {item.pratos.length}
                                                    </td>
                                                    <td
                                                        className="px-4 py-3 text-right font-semibold text-zinc-900 dark:text-white"
                                                        onClick={() =>
                                                            setExpandido(aberto ? null : item.ingredienteId)
                                                        }
                                                    >
                                                        {formatarQuantidadeIngrediente(item)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-400">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => iniciarEdicao(item)}
                                                                title="Configurar unidade/peso da peça"
                                                                className="rounded-lg p-1 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <span
                                                                onClick={() =>
                                                                    setExpandido(aberto ? null : item.ingredienteId)
                                                                }
                                                                className="cursor-pointer"
                                                            >
                                                                {aberto ? (
                                                                    <ChevronUp size={16} />
                                                                ) : (
                                                                    <ChevronDown size={16} />
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </tr>

                                        {aberto && !editando && (
                                            <tr key={`${item.ingredienteId}-detalhe`}>
                                                <td colSpan={4} className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/40">
                                                    <div className="space-y-2">
                                                        {item.pratos.map((prato) => (
                                                            <div
                                                                key={prato.produto}
                                                                className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm dark:bg-zinc-900"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <UtensilsCrossed
                                                                        size={14}
                                                                        className="text-zinc-400"
                                                                    />
                                                                    <span className="text-zinc-700 dark:text-zinc-300">
                                                                        {prato.produto}
                                                                    </span>
                                                                </div>

                                                                <div className="flex items-center gap-4 text-zinc-500">
                                                                    <span>
                                                                        {formatarNumero(prato.quantidadeVendida)}{' '}
                                                                        vendido(s)
                                                                    </span>
                                                                    <span className="font-medium text-zinc-900 dark:text-white">
                                                                        {item.unidadeMedida === 'UNIDADE'
                                                                            ? formatarUnidades(prato.quantidade)
                                                                            : formatarKg(prato.quantidade)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
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
                O consumo é calculado somando, para cada prato vendido que usa
                o ingrediente na ficha técnica: quantidade vendida × gramas
                (ou unidades) do ingrediente naquele prato. Um mesmo
                ingrediente usado em vários pratos diferentes (ex: Contra
                Filé na chapa e no espeto) aparece somado aqui. Use o lápis
                pra marcar um ingrediente como &quot;por unidade&quot;
                (Pastel, Coxinha, Costelinha...) em vez de peso, ou pra
                informar o peso de uma peça/pacote inteiro (ex: picanha
                ~1200g, pacote de batata frita 400g) e ver também &quot;quantas
                peças/pacotes&quot; comprar. Marque também &quot;Proteína&quot; nos
                cortes de carne — a Lista de Compra só sugere proteína e
                itens por unidade (Pastel, Coxinha, Camafeu, Costelinha...);
                o resto fica de fora de lá, mas continua aparecendo
                normalmente aqui. O campo &quot;Porção padrão (g)&quot; é pra
                corte sempre fatiado no mesmo tamanho (ex: 200g de Ancho,
                Picanha, Baby Beef, Filé Mignon): na visão &quot;Tamanho&quot;
                da Lista de Compra, qualquer gramatura maior vira múltiplos
                dessa porção (400g = 2x 200g), tudo somado numa linha só;
                gramatura menor (ex: Filé Mignon 100g do Kids) fica
                separada, sem mesclar.
            </p>
        </div>
    );
}
