'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Receipt, Trash2, X } from 'lucide-react';
import { AutocompleteInput } from '../ui/AutocompleteInput';

type CompraPendente = {
    id: string;
    description: string;
    value: number | null;
    purchasedAt: string | null;
    supplierName: string | null;
    noInvoiceProductsNote: string | null;
    couponUrl: string | null;
};

type StockItemOption = { id: string; nome: string; unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE' };

type LinhaForm = {
    modo: 'existente' | 'novo';
    stockItemId: string;
    novoNome: string;
    novaCategoria: string;
    novaUnidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
    quantidade: string;
    valorTotal: string;
};

function linhaVazia(): LinhaForm {
    return {
        modo: 'novo',
        stockItemId: '',
        novoNome: '',
        novaCategoria: '',
        novaUnidadeMedida: 'KG',
        quantidade: '',
        valorTotal: '',
    };
}

// Fluxo 2: compra sem NF e sem previsão de ter — só descrição textual
// e/ou foto do cupom (obrigatórias na hora de gerar a conta). Sem XML
// pra ler, então quem vincula ao estoque digita cada item do zero,
// usando a descrição/foto como referência do que foi comprado.
export function LinkPurchaseTab({ onChanged }: { onChanged: () => void }) {
    const [compras, setCompras] = useState<CompraPendente[]>([]);
    const [loading, setLoading] = useState(true);
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);

    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [compraDetalhe, setCompraDetalhe] = useState<{
        description: string;
        noInvoiceProductsNote: string | null;
        couponUrl: string | null;
    } | null>(null);
    const [linhas, setLinhas] = useState<LinhaForm[]>([]);
    const [carregandoItens, setCarregandoItens] = useState(false);
    const [salvando, setSalvando] = useState(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [comprasRes, itemsRes] = await Promise.all([
                api.get('/estoque/compras-pendentes', { params: { storeId: store.id } }),
                api.get('/estoque/itens', { params: { storeId: store.id } }),
            ]);
            setCompras(comprasRes.data);
            setStockItems(itemsRes.data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function abrir(compra: CompraPendente) {
        if (abertoId === compra.id) {
            setAbertoId(null);
            return;
        }

        setAbertoId(compra.id);
        setCarregandoItens(true);

        try {
            const response = await api.get(`/estoque/compra/${compra.id}/itens`);
            const data = response.data;
            setCompraDetalhe({
                description: data.description,
                noInvoiceProductsNote: data.noInvoiceProductsNote,
                couponUrl: data.couponUrl,
            });

            const jaVinculados = (data.itensVinculados || []) as Array<{
                stockItemId: string;
                stockItemNome: string;
                quantidade: number;
                valorTotal: number | null;
            }>;

            if (jaVinculados.length > 0) {
                setLinhas(
                    jaVinculados.map((v) => ({
                        modo: 'existente',
                        stockItemId: v.stockItemId,
                        novoNome: '',
                        novaCategoria: '',
                        novaUnidadeMedida: 'KG',
                        quantidade: String(v.quantidade),
                        valorTotal: v.valorTotal != null ? String(v.valorTotal) : '',
                    })),
                );
            } else {
                setLinhas([linhaVazia()]);
            }
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao carregar a compra.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
            setAbertoId(null);
        } finally {
            setCarregandoItens(false);
        }
    }

    function updateLinha(index: number, patch: Partial<LinhaForm>) {
        setLinhas((prev) => prev.map((linha, i) => (i === index ? { ...linha, ...patch } : linha)));
    }

    function addLinha() {
        setLinhas((prev) => [...prev, linhaVazia()]);
    }

    function removerLinha(index: number) {
        setLinhas((prev) => prev.filter((_, i) => i !== index));
    }

    async function salvarVinculo(compraId: string) {
        const itens = linhas
            .filter((linha) => linha.quantidade && (linha.modo === 'existente' ? linha.stockItemId : linha.novoNome.trim()))
            .map((linha) => ({
                stockItemId: linha.modo === 'existente' ? linha.stockItemId : undefined,
                novoNome: linha.modo === 'novo' ? linha.novoNome.trim() : undefined,
                novaCategoria: linha.modo === 'novo' ? linha.novaCategoria.trim() || undefined : undefined,
                novaUnidadeMedida: linha.modo === 'novo' ? linha.novaUnidadeMedida : undefined,
                quantidade: Number(linha.quantidade),
                valorTotal: linha.valorTotal ? Number(linha.valorTotal) : undefined,
            }));

        if (itens.length === 0) {
            toast.error('Preencha ao menos um item pra vincular.');
            return;
        }

        try {
            setSalvando(true);
            await api.post(`/estoque/compra/${compraId}/vincular`, { itens });
            toast.success('Estoque atualizado a partir da compra.');
            setAbertoId(null);
            await load();
            onChanged();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao vincular os itens.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvando(false);
        }
    }

    if (!getActiveStore()) return null;

    return (
        <div className="space-y-4">
            <p className="text-xs text-zinc-500">
                Compras sem NF e que <strong>não vão ter</strong> — geraram conta a pagar
                só com descrição dos produtos e/ou foto do cupom. Sem XML pra ler, então
                digite cada item comprado (nome, quantidade e valor) usando a descrição e
                a foto como referência.
            </p>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : compras.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhuma compra sem NF pendente de vínculo — tudo em dia.
                </div>
            ) : (
                <div className="space-y-2">
                    {compras.map((compra) => {
                        const aberto = abertoId === compra.id;

                        return (
                            <div
                                key={compra.id}
                                className="overflow-hidden rounded-2xl border border-amber-200 bg-white dark:border-amber-900/40 dark:bg-zinc-900"
                            >
                                <button
                                    onClick={() => abrir(compra)}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                >
                                    <div className="flex items-center gap-2">
                                        <Receipt size={16} className="text-amber-500" />
                                        <div>
                                            <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                                {compra.description}
                                                {compra.supplierName ? ` — ${compra.supplierName}` : ''}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {compra.purchasedAt
                                                    ? new Date(compra.purchasedAt).toLocaleDateString('pt-BR')
                                                    : '—'}{' '}
                                                ·{' '}
                                                {compra.value != null
                                                    ? compra.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                    : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-emerald-600">{aberto ? 'Fechar' : 'Vincular'}</span>
                                </button>

                                {aberto && (
                                    <div className="border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                                        {carregandoItens ? (
                                            <div className="py-6 text-center text-sm text-zinc-500">Carregando...</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {(compraDetalhe?.noInvoiceProductsNote || compraDetalhe?.couponUrl) && (
                                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                                                        {compraDetalhe.noInvoiceProductsNote && (
                                                            <p className="mb-1">
                                                                <strong>Descrição do que foi comprado:</strong>{' '}
                                                                {compraDetalhe.noInvoiceProductsNote}
                                                            </p>
                                                        )}
                                                        {compraDetalhe.couponUrl && (
                                                            <a
                                                                href={compraDetalhe.couponUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="font-medium underline"
                                                            >
                                                                Ver foto do cupom
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                {linhas.map((linha, index) => (
                                                    <div
                                                        key={index}
                                                        className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                                                    >
                                                        <div className="flex flex-wrap items-end gap-2">
                                                            <div className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                                                                <button
                                                                    onClick={() => updateLinha(index, { modo: 'existente' })}
                                                                    className={`px-2.5 py-1.5 text-xs font-medium ${linha.modo === 'existente'
                                                                        ? 'bg-emerald-600 text-white'
                                                                        : 'text-zinc-600 dark:text-zinc-300'
                                                                        }`}
                                                                >
                                                                    Item existente
                                                                </button>
                                                                <button
                                                                    onClick={() => updateLinha(index, { modo: 'novo' })}
                                                                    className={`px-2.5 py-1.5 text-xs font-medium ${linha.modo === 'novo'
                                                                        ? 'bg-emerald-600 text-white'
                                                                        : 'text-zinc-600 dark:text-zinc-300'
                                                                        }`}
                                                                >
                                                                    Novo item
                                                                </button>
                                                            </div>

                                                            {linha.modo === 'existente' ? (
                                                                <div className="min-w-[180px] rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 dark:border-zinc-700">
                                                                    <AutocompleteInput
                                                                        options={stockItems.map((si) => ({ id: si.id, nome: si.nome }))}
                                                                        value={linha.stockItemId}
                                                                        onChange={(id) => updateLinha(index, { stockItemId: id })}
                                                                        placeholder="Selecione..."
                                                                        className="h-full w-full bg-transparent text-xs outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <input
                                                                        value={linha.novoNome}
                                                                        onChange={(e) => updateLinha(index, { novoNome: e.target.value })}
                                                                        placeholder="Nome do item"
                                                                        className="w-40 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                    />
                                                                    <input
                                                                        value={linha.novaCategoria}
                                                                        onChange={(e) => updateLinha(index, { novaCategoria: e.target.value })}
                                                                        placeholder="Categoria (opcional)"
                                                                        className="w-36 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                    />
                                                                    <select
                                                                        value={linha.novaUnidadeMedida}
                                                                        onChange={(e) =>
                                                                            updateLinha(index, {
                                                                                novaUnidadeMedida: e.target.value as 'KG' | 'LITRO' | 'UNIDADE',
                                                                            })
                                                                        }
                                                                        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                    >
                                                                        <option value="KG">KG</option>
                                                                        <option value="LITRO">Litro</option>
                                                                        <option value="UNIDADE">Unidade</option>
                                                                    </select>
                                                                </>
                                                            )}

                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.001"
                                                                value={linha.quantidade}
                                                                onChange={(e) => updateLinha(index, { quantidade: e.target.value })}
                                                                placeholder="Quantidade"
                                                                className="w-28 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                            />
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                step="0.01"
                                                                value={linha.valorTotal}
                                                                onChange={(e) => updateLinha(index, { valorTotal: e.target.value })}
                                                                placeholder="Valor total"
                                                                className="w-28 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                            />

                                                            {linhas.length > 1 && (
                                                                <button
                                                                    onClick={() => removerLinha(index)}
                                                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                                                                    title="Remover item"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}

                                                <button
                                                    onClick={addLinha}
                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                >
                                                    <Plus size={14} /> Adicionar item
                                                </button>

                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => setAbertoId(null)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={14} /> Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => salvarVinculo(compra.id)}
                                                        disabled={salvando}
                                                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                                    >
                                                        {salvando ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Check size={14} />
                                                        )}
                                                        Salvar vínculo
                                                    </button>
                                                </div>
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
