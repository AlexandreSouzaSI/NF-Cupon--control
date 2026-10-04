'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { getUser, canManageProductCatalog } from '@/lib/auth';
import { toast } from 'sonner';
import {
    Check,
    ChefHat,
    Factory,
    Loader2,
    Plus,
    Search,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { AutocompleteInput } from '../ui/AutocompleteInput';

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
    // Categoria vinda do catálogo importado do PDF de Produtos da Meep
    // (ver ProductCatalogItem) — só vem preenchida quando a loja já
    // importou esse PDF. origemCatalogo não decide mais se a lixeirinha
    // aparece (ela agora aparece em QUALQUER prato pro Admin Master, ver
    // canManageProductCatalog) — mantido só porque pode ser útil pra
    // outra coisa no futuro.
    categoria?: string;
    origemCatalogo: boolean;
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
    const [removendoChave, setRemovendoChave] = useState<string | null>(null);
    const [importandoCatalogo, setImportandoCatalogo] = useState(false);
    const [limpandoLista, setLimpandoLista] = useState(false);

    // Importar PDF, excluir prato da lista e "excluir toda a lista" são
    // ações restritas ao Admin Master (dono do sistema) — quem só tem
    // acesso à Ficha Técnica continua vendo/usando só o botão
    // "Configurar" de cada prato (ver canManageProductCatalog em
    // lib/auth.ts, mesmo padrão de canDeleteForever).
    const podeGerenciarCatalogo = canManageProductCatalog(getUser());

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
            toast.error('Erro ao carregar as fichas técnicas.');
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

    // Muda a unidade de medida do item de Estoque direto daqui — mesmo
    // endpoint que a aba Estoque usa (PUT /product-sales/ingredients/:id).
    // Sem isso, todo item novo nasce como KG e fica errado pra bebida
    // (deveria ser UNIDADE — Coca-Cola, por exemplo) ou destilado
    // (deveria ser LITRO), sem precisar sair da Ficha Técnica pra
    // corrigir em Cadastros → Estoque.
    async function alterarUnidade(
        stockItemId: string,
        unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE',
    ) {
        setEstoqueItens((atual) =>
            atual.map((item) =>
                item.id === stockItemId ? { ...item, unidadeMedida } : item,
            ),
        );

        try {
            await api.put(`/product-sales/ingredients/${stockItemId}`, {
                unidadeMedida,
            });
            toast.success('Unidade atualizada.');
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao mudar a unidade.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
            await load();
        }
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

    // "Excluir toda a lista" — esconde de uma vez todo prato hoje visível
    // nesta loja (curado, com venda real ou do catálogo). Não apaga
    // histórico de venda nenhum, só pedido explícito de zerar a lista; só
    // volta reimportando o catálogo (PDF) ou, pros curados/vendidos, não
    // tem botão de desfazer por ora — por isso a confirmação é mais forte
    // que a de excluir um item só.
    async function limparLista() {
        const store = getActiveStore();
        if (!store) return;

        const confirmado = window.confirm(
            'Isso vai remover TODOS os pratos dessa lista (menos o histórico de vendas, que fica intacto). Essa ação não pode ser desfeita por aqui — só reimportando o catálogo. Continuar?',
        );
        if (!confirmado) return;

        try {
            setLimpandoLista(true);
            const { data } = await api.delete('/product-sales/catalog/all', {
                params: { storeId: store.id },
            });
            toast.success(`${data.ocultados} prato(s) removido(s) da lista.`);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao excluir a lista.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setLimpandoLista(false);
        }
    }

    // Exclui (esconde) um prato da lista — Admin Master, pra QUALQUER
    // prato (curado, com venda real ou do catálogo importado). Não apaga
    // nenhum histórico de venda nem ficha técnica, só some da lista daqui
    // pra frente (ver HiddenProductDish no backend).
    async function removerDoCatalogo(prato: PratoOverview) {
        const store = getActiveStore();
        if (!store) return;

        const confirmado = window.confirm(
            `Remover "${prato.produto}" da lista? Ele some da aba Produtos e da Ficha Técnica até ser vendido ou importado de novo.`,
        );
        if (!confirmado) return;

        try {
            setRemovendoChave(prato.produtoChave);
            await api.delete('/product-sales/catalog/item', {
                params: { storeId: store.id, produtoChave: prato.produtoChave },
            });
            toast.success('Item removido da lista.');
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao remover o item.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setRemovendoChave(null);
        }
    }

    // Importa o PDF de "Produtos" exportado do painel da Meep — ele traz
    // a categoria real de cada item (a API de vendas não traz). Usado
    // pra classificar os itens que hoje caem todos em "Vendas Meep".
    async function importarCatalogoPdf(file: File) {
        const store = getActiveStore();
        if (!store) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('storeId', store.id);

        try {
            setImportandoCatalogo(true);
            const { data } = await api.post('/product-sales/catalog/import-pdf', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            toast.success(
                `Catálogo importado: ${data.total} produtos (${data.novos} novos, ${data.atualizados} atualizados).`,
            );
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao importar o catálogo em PDF.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setImportandoCatalogo(false);
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
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
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
                    {podeGerenciarCatalogo && (
                        <>
                            <label
                                title="Importa o PDF de 'Produtos' exportado do painel da Meep — ele traz a categoria real de cada item, que a venda sincronizada automaticamente não traz"
                                className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                                    importandoCatalogo
                                        ? 'cursor-not-allowed border-zinc-200 text-zinc-400 dark:border-zinc-700'
                                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                                }`}
                            >
                                {importandoCatalogo ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Upload size={14} />
                                )}
                                Importar catálogo Meep (PDF)
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    disabled={importandoCatalogo}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (file) importarCatalogoPdf(file);
                                    }}
                                />
                            </label>

                            <button
                                onClick={limparLista}
                                disabled={limpandoLista}
                                title="Remove TODOS os pratos da lista (não apaga histórico de vendas) — só volta reimportando o catálogo"
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/60 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
                            >
                                {limpandoLista ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Trash2 size={14} />
                                )}
                                Excluir toda a lista
                            </button>
                        </>
                    )}

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
                            className="w-full rounded-lg border border-zinc-200 bg-transparent py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
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
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium text-zinc-900 dark:text-white">
                                                    {prato.produto}
                                                </p>
                                                {prato.categoria && (
                                                    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                                        {prato.categoria}
                                                    </span>
                                                )}
                                            </div>
                                            {!editando && (
                                                <div className="mt-1 flex flex-wrap gap-1.5">
                                                    {prato.itens.length === 0 ? (
                                                        <span className="text-xs text-zinc-400">
                                                            Sem ingredientes cadastrados
                                                        </span>
                                                    ) : (
                                                        prato.itens.map((item, idx) => {
                                                            const unidadeItem =
                                                                item.tipo === 'estoque'
                                                                    ? estoquePorNome[normalizar(item.nome)]
                                                                          ?.unidadeMedida
                                                                    : null;
                                                            const sufixo =
                                                                unidadeItem === 'LITRO'
                                                                    ? 'ml'
                                                                    : unidadeItem === 'UNIDADE'
                                                                      ? 'un'
                                                                      : unidadeItem === 'KG'
                                                                        ? 'g'
                                                                        : '';

                                                            return (
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
                                                                    {item.nome} ({item.gramas}
                                                                    {sufixo})
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {!editando && (
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <button
                                                    onClick={() => iniciarEdicao(prato)}
                                                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                >
                                                    Configurar
                                                </button>
                                                {podeGerenciarCatalogo && (
                                                    <button
                                                        onClick={() => removerDoCatalogo(prato)}
                                                        disabled={removendoChave === prato.produtoChave}
                                                        title="Remover esse prato da lista (não apaga venda real nem ficha técnica, só some daqui pra frente)"
                                                        className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-50"
                                                    >
                                                        {removendoChave === prato.produtoChave ? (
                                                            <Loader2 size={16} className="animate-spin" />
                                                        ) : (
                                                            <Trash2 size={16} />
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {editando && (
                                        <div className="mt-3 space-y-2 rounded-xl border border-blue-400/40 bg-blue-500/5 p-3">
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
                                                                className="w-24 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
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

                                                        {itemEstoque && (
                                                            <select
                                                                value={unidade}
                                                                onChange={(e) =>
                                                                    alterarUnidade(
                                                                        itemEstoque.id,
                                                                        e.target.value as
                                                                            | 'KG'
                                                                            | 'LITRO'
                                                                            | 'UNIDADE',
                                                                    )
                                                                }
                                                                title="Unidade de medida desse item no Estoque — muda pra todos os pratos que usam ele, não só este"
                                                                className="shrink-0 rounded-lg border border-zinc-200 bg-transparent px-2 py-2 text-xs outline-none focus:border-blue-500 dark:border-zinc-700"
                                                            >
                                                                <option value="KG">Kg</option>
                                                                <option value="LITRO">Litro</option>
                                                                <option value="UNIDADE">Unidade</option>
                                                            </select>
                                                        )}

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
                                                            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700"
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
                                                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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
