'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    Crown,
    Scale,
} from 'lucide-react';
import { toast } from 'sonner';

type QuotationStatus =
    | 'DRAFT'
    | 'SENT'
    | 'SUPPLIER_SELECTED'
    | 'ORDER_CONFIRMED'
    | 'CANCELED';

type QuotationSummary = {
    id: string;
    categoryName: string;
    status: QuotationStatus;
    sentAt: string | null;
    itemsCount: number;
    suppliersInvited: number;
    suppliersResponded: number;
    suppliersDeclined: number;
    selectedSupplierName: string | null;
};

type UnidadeMedida = 'KG' | 'LITRO' | 'UNIDADE';

type QuotationDetailItem = {
    id: string;
    descricao: string;
    unidadeMedida: UnidadeMedida;
    quantidadeSugerida: number;
};

type QuotationDetailSupplier = {
    id: string;
    supplierId: string;
    supplierName: string;
    respondedAt: string | null;
    declinedAt: string | null;
    itemsRespondidos: number;
    total: number;
    prices: Record<string, number>;
};

type QuotationDetail = {
    id: string;
    storeName: string;
    categoryName: string;
    status: QuotationStatus;
    sentAt: string | null;
    selectedSupplierId: string | null;
    items: QuotationDetailItem[];
    suppliers: QuotationDetailSupplier[];
};

const STATUS_LABEL: Record<QuotationStatus, string> = {
    DRAFT: 'Rascunho',
    SENT: 'Aguardando fornecedores',
    SUPPLIER_SELECTED: 'Fornecedor escolhido',
    ORDER_CONFIRMED: 'Pedido confirmado',
    CANCELED: 'Cancelada',
};

const STATUS_COLOR: Record<QuotationStatus, string> = {
    DRAFT: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    SENT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    SUPPLIER_SELECTED: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
    ORDER_CONFIRMED: 'bg-green-500/10 text-green-600 dark:text-green-400',
    CANCELED: 'bg-red-500/10 text-red-500',
};

function formatMoney(valor: number) {
    return valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR');
}

export function QuotationsTab() {
    const store = getActiveStore();

    const [quotations, setQuotations] = useState<QuotationSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<QuotationDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [selectingId, setSelectingId] = useState<string | null>(null);
    const [requestingConfirmation, setRequestingConfirmation] = useState(false);

    async function loadList() {
        if (!store) return;

        try {
            setLoading(true);

            const response = await api.get('/quotations', {
                params: { storeId: store.id },
            });

            setQuotations(response.data || []);
        } catch {
            toast.error('Erro ao carregar cotações');
        } finally {
            setLoading(false);
        }
    }

    async function loadDetail(id: string) {
        try {
            setLoadingDetail(true);

            const response = await api.get(`/quotations/${id}`);
            setDetail(response.data);
        } catch {
            toast.error('Erro ao carregar detalhe da cotação');
        } finally {
            setLoadingDetail(false);
        }
    }

    useEffect(() => {
        loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function openQuotation(id: string) {
        setSelectedId(id);
        setDetail(null);
        loadDetail(id);
    }

    function backToList() {
        setSelectedId(null);
        setDetail(null);
        loadList();
    }

    async function handleSelectSupplier(supplierId: string) {
        if (!selectedId) return;

        try {
            setSelectingId(supplierId);

            await api.post(`/quotations/${selectedId}/select-supplier`, {
                supplierId,
            });

            toast.success('Fornecedor escolhido!');
            await loadDetail(selectedId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao escolher fornecedor',
            );
        } finally {
            setSelectingId(null);
        }
    }

    async function handleRequestConfirmation() {
        if (!selectedId) return;

        try {
            setRequestingConfirmation(true);

            await api.post(`/quotations/${selectedId}/request-order-confirmation`);

            toast.success('Pedido de confirmação enviado pro fornecedor por WhatsApp.');
            await loadDetail(selectedId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao pedir confirmação do pedido',
            );
        } finally {
            setRequestingConfirmation(false);
        }
    }

    if (!store) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Selecione uma loja ativa no topo do sistema.
            </p>
        );
    }

    if (selectedId) {
        const menorTotal = detail
            ? Math.min(
                ...detail.suppliers
                    .filter((s) => s.itemsRespondidos > 0)
                    .map((s) => s.total),
                Infinity,
            )
            : Infinity;

        return (
            <div className="space-y-4">
                <button
                    type="button"
                    onClick={backToList}
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-teal-600 dark:hover:text-teal-400"
                >
                    <ArrowLeft size={15} />
                    Voltar pras cotações
                </button>

                {loadingDetail || !detail ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-lg font-bold">
                                    {detail.categoryName}
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {detail.storeName} · enviada em{' '}
                                    {formatDate(detail.sentAt)}
                                </p>
                            </div>
                            <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLOR[detail.status]}`}
                            >
                                {STATUS_LABEL[detail.status]}
                            </span>
                        </div>

                        {detail.status === 'SUPPLIER_SELECTED' && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                    Vencedor:{' '}
                                    <span className="font-semibold">
                                        {
                                            detail.suppliers.find(
                                                (s) =>
                                                    s.supplierId ===
                                                    detail.selectedSupplierId,
                                            )?.supplierName
                                        }
                                    </span>
                                    . Peça a confirmação do pedido por
                                    WhatsApp pra Purchase nascer sozinha
                                    quando ele confirmar.
                                </p>
                                <button
                                    type="button"
                                    disabled={requestingConfirmation}
                                    onClick={handleRequestConfirmation}
                                    className="inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-500 px-4 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                >
                                    {requestingConfirmation
                                        ? 'Enviando...'
                                        : 'Pedir confirmação do pedido'}
                                </button>
                            </div>
                        )}

                        {detail.status === 'ORDER_CONFIRMED' && (
                            <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4 text-sm text-green-700 dark:text-green-400">
                                Pedido confirmado pelo fornecedor — a compra
                                já foi criada e está aguardando recebimento
                                em Compras.
                            </div>
                        )}

                        {detail.suppliers.length === 0 ? (
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Nenhum fornecedor foi convidado nessa cotação.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-xs text-zinc-500">
                                        <tr>
                                            <th className="px-4 py-2.5">Item</th>
                                            <th className="px-4 py-2.5">Qtd</th>
                                            {detail.suppliers.map((s) => (
                                                <th
                                                    key={s.id}
                                                    className="px-4 py-2.5 whitespace-nowrap"
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {s.supplierName}
                                                        {detail.selectedSupplierId ===
                                                            s.supplierId && (
                                                                <Crown
                                                                    size={13}
                                                                    className="text-amber-500"
                                                                />
                                                            )}
                                                    </div>
                                                    {s.declinedAt && (
                                                        <span className="text-[10px] font-normal text-red-500">
                                                            recusou
                                                        </span>
                                                    )}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {detail.items.map((item) => (
                                            <tr key={item.id}>
                                                <td className="px-4 py-2.5 font-medium">
                                                    {item.descricao}
                                                </td>
                                                <td className="px-4 py-2.5 text-zinc-500">
                                                    {item.quantidadeSugerida.toLocaleString(
                                                        'pt-BR',
                                                        {
                                                            maximumFractionDigits: 3,
                                                        },
                                                    )}{' '}
                                                    {item.unidadeMedida === 'KG'
                                                        ? 'kg'
                                                        : item.unidadeMedida === 'LITRO'
                                                          ? 'L'
                                                          : 'un'}
                                                </td>
                                                {detail.suppliers.map((s) => {
                                                    const preco =
                                                        s.prices[item.id];
                                                    return (
                                                        <td
                                                            key={s.id}
                                                            className="px-4 py-2.5 text-zinc-600 dark:text-zinc-400"
                                                        >
                                                            {preco != null
                                                                ? formatMoney(
                                                                    preco,
                                                                )
                                                                : '—'}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                                            <td
                                                className="px-4 py-2.5 font-semibold"
                                                colSpan={2}
                                            >
                                                Total
                                            </td>
                                            {detail.suppliers.map((s) => {
                                                const isMenor =
                                                    s.itemsRespondidos > 0 &&
                                                    s.total === menorTotal;

                                                return (
                                                    <td
                                                        key={s.id}
                                                        className={`px-4 py-2.5 font-semibold ${isMenor
                                                            ? 'text-teal-600 dark:text-teal-400'
                                                            : ''
                                                            }`}
                                                    >
                                                        {s.itemsRespondidos > 0
                                                            ? formatMoney(
                                                                s.total,
                                                            )
                                                            : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        <tr>
                                            <td
                                                className="px-4 py-2.5"
                                                colSpan={2}
                                            />
                                            {detail.suppliers.map((s) => {
                                                const isWinner =
                                                    detail.selectedSupplierId ===
                                                    s.supplierId;
                                                const podeEscolher =
                                                    (detail.status === 'SENT' ||
                                                        detail.status ===
                                                        'SUPPLIER_SELECTED') &&
                                                    Boolean(s.respondedAt);

                                                return (
                                                    <td
                                                        key={s.id}
                                                        className="px-4 py-2.5"
                                                    >
                                                        {isWinner ? (
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400">
                                                                <CheckCircle2
                                                                    size={13}
                                                                />
                                                                Escolhido
                                                            </span>
                                                        ) : podeEscolher ? (
                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    selectingId ===
                                                                    s.supplierId
                                                                }
                                                                onClick={() =>
                                                                    handleSelectSupplier(
                                                                        s.supplierId,
                                                                    )
                                                                }
                                                                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                                                            >
                                                                Escolher
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-zinc-400">
                                                                {s.respondedAt
                                                                    ? '—'
                                                                    : 'sem preço'}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-500">
                    <Scale size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold">Cotações enviadas</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Compare os preços que os fornecedores mandaram e
                        escolha o vencedor de cada cotação.
                    </p>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : quotations.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma cotação enviada ainda pra essa loja. Monte a
                    lista sugerida e mande a cotação pra ver ela aparecer
                    aqui.
                </p>
            ) : (
                <div className="space-y-2">
                    {quotations.map((q) => (
                        <button
                            key={q.id}
                            type="button"
                            onClick={() => openQuotation(q.id)}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left hover:border-teal-500/50"
                        >
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">
                                        {q.categoryName}
                                    </p>
                                    <span
                                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLOR[q.status]}`}
                                    >
                                        {STATUS_LABEL[q.status]}
                                    </span>
                                </div>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Enviada em {formatDate(q.sentAt)} ·{' '}
                                    {q.itemsCount}{' '}
                                    {q.itemsCount === 1 ? 'item' : 'itens'} ·{' '}
                                    {q.suppliersResponded}/{q.suppliersInvited}{' '}
                                    responderam
                                    {q.selectedSupplierName
                                        ? ` · vencedor: ${q.selectedSupplierName}`
                                        : ''}
                                </p>
                            </div>
                            <ChevronRight
                                size={18}
                                className="shrink-0 text-zinc-400"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
