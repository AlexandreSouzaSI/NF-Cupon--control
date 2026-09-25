'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    ArrowLeft,
    CheckCircle2,
    ChevronRight,
    Crown,
    Pencil,
    Scale,
    X,
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
    lastPaidPrice: number | null;
};

type QuotationCellPrice = {
    unitPrice: number;
    editedUnitPrice: number | null;
    effectivePrice: number;
    selected: boolean;
};

type QuotationDetailSupplier = {
    id: string;
    supplierId: string;
    supplierName: string;
    respondedAt: string | null;
    declinedAt: string | null;
    confirmedAt: string | null;
    itemsRespondidos: number;
    total: number;
    selectedTotal: number;
    prices: Record<string, QuotationCellPrice>;
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
    ORDER_CONFIRMED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
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
    const [requestingConfirmation, setRequestingConfirmation] = useState(false);

    // Célula preço×fornecedor sendo editada no momento (lápis clicado) —
    // só uma por vez, com o valor digitado em edição.
    const [editingCell, setEditingCell] = useState<{
        itemId: string;
        supplierId: string;
    } | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [savingCell, setSavingCell] = useState<string | null>(null);

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

    async function handleToggleSelection(itemId: string, supplierId: string) {
        if (!selectedId) return;

        const cellKey = `${itemId}:${supplierId}`;

        try {
            setSavingCell(cellKey);

            await api.post(
                `/quotations/${selectedId}/items/${itemId}/suppliers/${supplierId}/toggle-selection`,
            );

            await loadDetail(selectedId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao selecionar item do fornecedor',
            );
        } finally {
            setSavingCell(null);
        }
    }

    function startEditingCell(itemId: string, supplierId: string, atual: number) {
        setEditingCell({ itemId, supplierId });
        setEditingValue(String(atual));
    }

    function cancelEditingCell() {
        setEditingCell(null);
        setEditingValue('');
    }

    async function saveEditingCell() {
        if (!selectedId || !editingCell) return;

        const unitPrice = Number(editingValue.replace(',', '.'));
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            toast.error('Preço inválido');
            return;
        }

        const { itemId, supplierId } = editingCell;
        const cellKey = `${itemId}:${supplierId}`;

        try {
            setSavingCell(cellKey);

            await api.patch(
                `/quotations/${selectedId}/items/${itemId}/suppliers/${supplierId}/price`,
                { unitPrice },
            );

            toast.success('Preço atualizado');
            setEditingCell(null);
            setEditingValue('');
            await loadDetail(selectedId);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao editar preço',
            );
        } finally {
            setSavingCell(null);
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

                        {(detail.status === 'SENT' ||
                            detail.status === 'SUPPLIER_SELECTED') && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                Clique no preço do fornecedor pra escolher de
                                quem comprar cada item — dá pra escolher itens
                                de fornecedores diferentes na mesma cotação.
                                Use o lápis pra ajustar o preço na mão (ex:
                                desconto negociado por telefone).
                            </p>
                        )}

                        {detail.status === 'SUPPLIER_SELECTED' && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                    {
                                        detail.suppliers.filter((s) =>
                                            Object.values(s.prices).some(
                                                (p) => p.selected,
                                            ),
                                        ).length
                                    }{' '}
                                    fornecedor(es) com item(ns) escolhido(s).
                                    Peça a confirmação do pedido por WhatsApp
                                    — cada fornecedor recebe só os itens que
                                    ele ganhou, e a compra nasce sozinha
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
                            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-700 dark:text-blue-400">
                                Pedido confirmado — a(s) compra(s) já
                                foram criadas e estão aguardando recebimento
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
                                            <th className="px-4 py-2.5 whitespace-nowrap">
                                                Últ. preço
                                            </th>
                                            {detail.suppliers.map((s) => {
                                                const ganhouAlgo = Object.values(
                                                    s.prices,
                                                ).some((p) => p.selected);

                                                return (
                                                    <th
                                                        key={s.id}
                                                        className="px-4 py-2.5 whitespace-nowrap"
                                                    >
                                                        <div className="flex items-center gap-1">
                                                            {s.supplierName}
                                                            {ganhouAlgo && (
                                                                <Crown
                                                                    size={13}
                                                                    className="text-amber-500"
                                                                />
                                                            )}
                                                            {s.confirmedAt && (
                                                                <CheckCircle2
                                                                    size={13}
                                                                    className="text-blue-500"
                                                                />
                                                            )}
                                                        </div>
                                                        {s.declinedAt && (
                                                            <span className="text-[10px] font-normal text-red-500">
                                                                recusou
                                                            </span>
                                                        )}
                                                    </th>
                                                );
                                            })}
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
                                                <td className="px-4 py-2.5 text-xs text-zinc-400">
                                                    {item.lastPaidPrice != null
                                                        ? formatMoney(
                                                            item.lastPaidPrice,
                                                        )
                                                        : '—'}
                                                </td>
                                                {detail.suppliers.map((s) => {
                                                    const preco =
                                                        s.prices[item.id];
                                                    const podeEditar =
                                                        detail.status ===
                                                            'SENT' ||
                                                        detail.status ===
                                                            'SUPPLIER_SELECTED';
                                                    const cellKey = `${item.id}:${s.supplierId}`;
                                                    const isEditing =
                                                        editingCell?.itemId ===
                                                            item.id &&
                                                        editingCell?.supplierId ===
                                                            s.supplierId;

                                                    if (!preco) {
                                                        return (
                                                            <td
                                                                key={s.id}
                                                                className="px-4 py-2.5 text-xs text-zinc-400"
                                                            >
                                                                {s.declinedAt
                                                                    ? '—'
                                                                    : 'sem preço'}
                                                            </td>
                                                        );
                                                    }

                                                    if (isEditing) {
                                                        return (
                                                            <td
                                                                key={s.id}
                                                                className="px-4 py-2.5"
                                                            >
                                                                <div className="flex items-center gap-1">
                                                                    <input
                                                                        autoFocus
                                                                        type="text"
                                                                        inputMode="decimal"
                                                                        value={
                                                                            editingValue
                                                                        }
                                                                        onChange={(e) =>
                                                                            setEditingValue(
                                                                                e.target.value,
                                                                            )
                                                                        }
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter')
                                                                                saveEditingCell();
                                                                            if (e.key === 'Escape')
                                                                                cancelEditingCell();
                                                                        }}
                                                                        className="w-20 rounded-md border border-teal-500 bg-white px-1.5 py-1 text-xs dark:bg-zinc-950"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            savingCell ===
                                                                            cellKey
                                                                        }
                                                                        onClick={saveEditingCell}
                                                                        className="text-teal-600 hover:text-teal-700 disabled:opacity-50"
                                                                        title="Salvar"
                                                                    >
                                                                        <CheckCircle2 size={15} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelEditingCell}
                                                                        className="text-zinc-400 hover:text-red-500"
                                                                        title="Cancelar"
                                                                    >
                                                                        <X size={15} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td
                                                            key={s.id}
                                                            className="px-4 py-2.5"
                                                        >
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        !podeEditar ||
                                                                        savingCell ===
                                                                            cellKey
                                                                    }
                                                                    onClick={() =>
                                                                        handleToggleSelection(
                                                                            item.id,
                                                                            s.supplierId,
                                                                        )
                                                                    }
                                                                    className={`rounded-lg border px-2.5 py-1 text-left text-sm transition-colors disabled:cursor-default ${
                                                                        preco.selected
                                                                            ? 'border-teal-500 bg-teal-500/15 font-semibold text-teal-700 dark:text-teal-300'
                                                                            : 'border-transparent text-zinc-600 hover:border-zinc-300 dark:text-zinc-400 dark:hover:border-zinc-700'
                                                                    }`}
                                                                    title={
                                                                        podeEditar
                                                                            ? 'Clique pra escolher esse item desse fornecedor'
                                                                            : undefined
                                                                    }
                                                                >
                                                                    {formatMoney(
                                                                        preco.effectivePrice,
                                                                    )}
                                                                </button>
                                                                {preco.editedUnitPrice !=
                                                                    null && (
                                                                    <span
                                                                        className="text-[10px] text-zinc-400 line-through"
                                                                        title="Preço original do fornecedor"
                                                                    >
                                                                        {formatMoney(
                                                                            preco.unitPrice,
                                                                        )}
                                                                    </span>
                                                                )}
                                                                {podeEditar && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            startEditingCell(
                                                                                item.id,
                                                                                s.supplierId,
                                                                                preco.effectivePrice,
                                                                            )
                                                                        }
                                                                        className="text-zinc-400 hover:text-teal-600 dark:hover:text-teal-400"
                                                                        title="Editar preço na mão"
                                                                    >
                                                                        <Pencil size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
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
                                                colSpan={3}
                                            >
                                                Total escolhido
                                            </td>
                                            {detail.suppliers.map((s) => (
                                                <td
                                                    key={s.id}
                                                    className={`px-4 py-2.5 font-semibold ${
                                                        s.selectedTotal > 0
                                                            ? 'text-teal-600 dark:text-teal-400'
                                                            : 'text-zinc-400'
                                                    }`}
                                                >
                                                    {s.selectedTotal > 0
                                                        ? formatMoney(
                                                            s.selectedTotal,
                                                        )
                                                        : '—'}
                                                </td>
                                            ))}
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
