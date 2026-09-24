'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { Check, FileStack, Loader2, X } from 'lucide-react';
import { AutocompleteInput } from '../ui/AutocompleteInput';

type NfPendente = {
    id: string;
    chaveAcesso: string;
    issuerName: string | null;
    issuerCnpj: string | null;
    value: number | null;
    issueDate: string | null;
};

type StockItemOption = { id: string; nome: string; unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE' };

type NfItem = {
    itemIndex: number;
    descricao?: string;
    ncm?: string;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    valorTotal?: number;
    vinculo: { stockItemId: string; stockItemNome: string; quantidade: number; valorTotal: number | null } | null;
    sugestao: { stockItemId: string; stockItemNome: string; categoria: string | null } | null;
};

type LinhaForm = {
    modo: 'existente' | 'novo';
    stockItemId: string;
    novoNome: string;
    novaCategoria: string;
    novaUnidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
    quantidade: string;
    valorTotal: string;
};

export function LinkNfTab({
    onChanged,
    autoOpenNfId,
}: {
    onChanged: () => void;
    // Vindo do "Conciliar NF" de Compras (?nfId= na URL) — abre esse painel
    // sozinho assim que a NF aparecer na lista de pendentes, sem precisar
    // procurar e clicar. Só tenta uma vez (guardado em autoOpenedRef) pra
    // não reabrir se a pessoa fechar o painel manualmente depois.
    autoOpenNfId?: string | null;
}) {
    const [nfs, setNfs] = useState<NfPendente[]>([]);
    const [loading, setLoading] = useState(true);
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);

    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [nfItens, setNfItens] = useState<NfItem[]>([]);
    const [linhas, setLinhas] = useState<Record<number, LinhaForm>>({});
    const [carregandoItens, setCarregandoItens] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const autoOpenedRef = useRef(false);

    async function load() {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const [nfsRes, itemsRes] = await Promise.all([
                api.get('/estoque/nf-pendentes', { params: { storeId: store.id } }),
                api.get('/estoque/itens', { params: { storeId: store.id } }),
            ]);
            setNfs(nfsRes.data);
            setStockItems(itemsRes.data);

            if (autoOpenNfId && !autoOpenedRef.current) {
                const alvo: NfPendente | undefined = nfsRes.data.find(
                    (nf: NfPendente) => nf.id === autoOpenNfId,
                );

                if (alvo) {
                    autoOpenedRef.current = true;
                    abrir(alvo);
                }
            }
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

    async function abrir(nf: NfPendente) {
        if (abertoId === nf.id) {
            setAbertoId(null);
            return;
        }

        setAbertoId(nf.id);
        setCarregandoItens(true);

        try {
            const response = await api.get(`/estoque/nf/${nf.id}/itens`);
            const itens: NfItem[] = response.data.itens;
            setNfItens(itens);

            const iniciais: Record<number, LinhaForm> = {};
            for (const item of itens) {
                // Prioridade: vínculo já salvo > sugestão automática
                // (aprendida do mesmo fornecedor) > item novo em branco.
                const stockItemPreenchido = item.vinculo?.stockItemId || item.sugestao?.stockItemId || '';

                iniciais[item.itemIndex] = {
                    modo: stockItemPreenchido ? 'existente' : 'novo',
                    stockItemId: stockItemPreenchido,
                    novoNome: stockItemPreenchido ? '' : item.descricao || '',
                    novaCategoria: '',
                    novaUnidadeMedida: 'KG',
                    quantidade: String(item.vinculo?.quantidade ?? item.quantidade ?? ''),
                    valorTotal: String(item.vinculo?.valorTotal ?? item.valorTotal ?? ''),
                };
            }
            setLinhas(iniciais);
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao carregar os itens da NF.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
            setAbertoId(null);
        } finally {
            setCarregandoItens(false);
        }
    }

    function updateLinha(itemIndex: number, patch: Partial<LinhaForm>) {
        setLinhas((prev) => ({ ...prev, [itemIndex]: { ...prev[itemIndex], ...patch } }));
    }

    async function salvarVinculo(nfId: string) {
        const itens = Object.entries(linhas)
            .filter(([, linha]) => linha.quantidade && (linha.modo === 'existente' ? linha.stockItemId : linha.novoNome.trim()))
            .map(([itemIndex, linha]) => ({
                itemIndex: Number(itemIndex),
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
            await api.post(`/estoque/nf/${nfId}/vincular`, { itens });
            toast.success('Estoque atualizado a partir da NF.');
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

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-xs text-zinc-500">
                Aparecem aqui NFs de mercadoria já <strong>aceitas</strong> ou já{' '}
                <strong>vinculadas a uma compra</strong> (aba Notas Fiscais → Entrada) —
                as duas formas de resolver uma NF. Ligue cada item da nota a um item de
                estoque — existente ou novo — pra virar entrada. Quando o mesmo
                fornecedor repetir um item, a sugestão de vínculo já vem preenchida;
                só confira e salve, ou troque. Uma NF só some dessa lista quando todos
                os itens forem vinculados.
            </p>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : nfs.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhuma NF pendente de vínculo — tudo em dia.
                </div>
            ) : (
                <div className="space-y-2">
                    {nfs.map((nf) => {
                        const aberto = abertoId === nf.id;

                        return (
                            <div
                                key={nf.id}
                                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                            >
                                <button
                                    onClick={() => abrir(nf)}
                                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                >
                                    <div className="flex items-center gap-2">
                                        <FileStack size={16} className="text-zinc-400" />
                                        <div>
                                            <p className="text-sm font-medium text-zinc-900 dark:text-white">
                                                {nf.issuerName || 'Emitente não identificado'}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {nf.issueDate ? new Date(nf.issueDate).toLocaleDateString('pt-BR') : '—'} ·{' '}
                                                {nf.value != null
                                                    ? nf.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                                    : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-emerald-600">{aberto ? 'Fechar' : 'Vincular'}</span>
                                </button>

                                {aberto && (
                                    <div className="border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
                                        {carregandoItens ? (
                                            <div className="py-6 text-center text-sm text-zinc-500">Carregando itens...</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {nfItens.map((item) => {
                                                    const linha = linhas[item.itemIndex];
                                                    if (!linha) return null;

                                                    return (
                                                        <div
                                                            key={item.itemIndex}
                                                            className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                                                        >
                                                            <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">
                                                                {item.descricao || 'Item sem descrição'}
                                                                <span className="ml-2 text-xs font-normal text-zinc-500">
                                                                    {item.quantidade} {item.unidade} ·{' '}
                                                                    {item.valorTotal != null
                                                                        ? item.valorTotal.toLocaleString('pt-BR', {
                                                                            style: 'currency',
                                                                            currency: 'BRL',
                                                                        })
                                                                        : ''}
                                                                </span>
                                                                {!item.vinculo && item.sugestao && (
                                                                    <span
                                                                        className="ml-2 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-500"
                                                                        title={`Última vez esse fornecedor mandou esse item ele foi ligado a "${item.sugestao.stockItemNome}" — confira e dê OK, ou troque.`}
                                                                    >
                                                                        Sugestão automática: {item.sugestao.stockItemNome}
                                                                    </span>
                                                                )}
                                                            </p>

                                                            <div className="flex flex-wrap items-end gap-2">
                                                                <div className="flex overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                                                                    <button
                                                                        onClick={() => updateLinha(item.itemIndex, { modo: 'existente' })}
                                                                        className={`px-2.5 py-1.5 text-xs font-medium ${linha.modo === 'existente'
                                                                            ? 'bg-emerald-600 text-white'
                                                                            : 'text-zinc-600 dark:text-zinc-300'
                                                                            }`}
                                                                    >
                                                                        Item existente
                                                                    </button>
                                                                    <button
                                                                        onClick={() => updateLinha(item.itemIndex, { modo: 'novo' })}
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
                                                                            onChange={(id) => updateLinha(item.itemIndex, { stockItemId: id })}
                                                                            placeholder="Selecione..."
                                                                            className="h-full w-full bg-transparent text-xs outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                                                                        />
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <input
                                                                            value={linha.novoNome}
                                                                            onChange={(e) => updateLinha(item.itemIndex, { novoNome: e.target.value })}
                                                                            placeholder="Nome do item"
                                                                            className="w-40 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                        />
                                                                        <input
                                                                            value={linha.novaCategoria}
                                                                            onChange={(e) => updateLinha(item.itemIndex, { novaCategoria: e.target.value })}
                                                                            placeholder="Categoria (opcional)"
                                                                            className="w-36 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                        />
                                                                        <select
                                                                            value={linha.novaUnidadeMedida}
                                                                            onChange={(e) =>
                                                                                updateLinha(item.itemIndex, {
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
                                                                    onChange={(e) => updateLinha(item.itemIndex, { quantidade: e.target.value })}
                                                                    placeholder="Quantidade"
                                                                    className="w-28 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step="0.01"
                                                                    value={linha.valorTotal}
                                                                    onChange={(e) => updateLinha(item.itemIndex, { valorTotal: e.target.value })}
                                                                    placeholder="Valor total"
                                                                    className="w-28 rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-zinc-700"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}

                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => setAbertoId(null)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={14} /> Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => salvarVinculo(nf.id)}
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
