'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Calculator,
    CalendarDays,
    CheckCircle2,
    Download,
    Landmark,
    Pencil,
    Plus,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { Pagination } from '../../src/components/ui/Pagination';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

type Reconciliation = {
    id: string;
    date: string;
    systemCash: string;
    systemDebit: string;
    systemCredit: string;
    bankCash: string;
    bankDebit: string;
    bankCredit: string;
    otherSystem: string;
    otherBank: string;
    otherDescription: string | null;
    withdrawalAmount: string;
    withdrawalReason: string | null;
    notes: string | null;
    launchedBy?: { name: string } | null;
};

type FormState = {
    id: string | null;
    date: string;
    systemCash: string;
    systemDebit: string;
    systemCredit: string;
    bankCash: string;
    bankDebit: string;
    bankCredit: string;
    otherSystem: string;
    otherBank: string;
    otherDescription: string;
    withdrawalAmount: string;
    withdrawalReason: string;
    notes: string;
};

const PAGE_SIZE = 10;

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function blankForm(): FormState {
    return {
        id: null,
        date: todayISO(),
        systemCash: '',
        systemDebit: '',
        systemCredit: '',
        bankCash: '',
        bankDebit: '',
        bankCredit: '',
        otherSystem: '',
        otherBank: '',
        otherDescription: '',
        withdrawalAmount: '',
        withdrawalReason: '',
        notes: '',
    };
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function num(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

// Soma bruta de todas as formas de pagamento de um registro salvo
// (histórico), incluindo Outros.
function totalsOf(item: Reconciliation) {
    const system =
        Number(item.systemCash) +
        Number(item.systemDebit) +
        Number(item.systemCredit) +
        Number(item.otherSystem || 0);
    const bank =
        Number(item.bankCash) +
        Number(item.bankDebit) +
        Number(item.bankCredit) +
        Number(item.otherBank || 0);
    const withdrawal = Number(item.withdrawalAmount || 0);
    // Diferença ajustada — vale/retirada explica parte do que faltou no
    // banco (dinheiro que saiu do caixa antes de virar depósito).
    const adjustedDiff = bank - system + withdrawal;
    return { system, bank, adjustedDiff };
}

export default function CashReconciliationPage() {
    const [form, setForm] = useState<FormState>(blankForm());
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [items, setItems] = useState<Reconciliation[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loadingList, setLoadingList] = useState(true);

    const activeStore = getActiveStore();

    async function loadList(targetPage: number) {
        if (!activeStore) return;

        try {
            setLoadingList(true);
            const response = await api.get('/cash-reconciliation', {
                params: {
                    storeId: activeStore.id,
                    page: targetPage,
                    pageSize: PAGE_SIZE,
                },
            });
            setItems(response.data.items);
            setTotalPages(
                Math.max(1, Math.ceil(response.data.total / PAGE_SIZE)),
            );
        } catch {
            toast.error('Erro ao carregar o histórico de conciliações.');
        } finally {
            setLoadingList(false);
        }
    }

    useEffect(() => {
        loadList(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, activeStore?.id]);

    function selectRow(row: Reconciliation) {
        setForm({
            id: row.id,
            date: row.date.slice(0, 10),
            systemCash: row.systemCash,
            systemDebit: row.systemDebit,
            systemCredit: row.systemCredit,
            bankCash: row.bankCash,
            bankDebit: row.bankDebit,
            bankCredit: row.bankCredit,
            otherSystem: row.otherSystem && Number(row.otherSystem) !== 0
                ? row.otherSystem
                : '',
            otherBank: row.otherBank && Number(row.otherBank) !== 0
                ? row.otherBank
                : '',
            otherDescription: row.otherDescription || '',
            withdrawalAmount:
                row.withdrawalAmount && Number(row.withdrawalAmount) !== 0
                    ? row.withdrawalAmount
                    : '',
            withdrawalReason: row.withdrawalReason || '',
            notes: row.notes || '',
        });
    }

    function startNew() {
        setForm(blankForm());
    }

    async function handleDelete(id: string) {
        if (!confirm('Excluir esta conciliação? Essa ação não pode ser desfeita.')) {
            return;
        }

        try {
            setDeletingId(id);
            await api.delete(`/cash-reconciliation/${id}`);
            toast.success('Conciliação excluída.');
            if (form.id === id) {
                startNew();
            }
            loadList(page);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao excluir a conciliação.';
            toast.error(message);
        } finally {
            setDeletingId(null);
        }
    }

    const totalSystem =
        num(form.systemCash) +
        num(form.systemDebit) +
        num(form.systemCredit) +
        num(form.otherSystem);
    const totalBank =
        num(form.bankCash) +
        num(form.bankDebit) +
        num(form.bankCredit) +
        num(form.otherBank);
    const rawDiff = totalBank - totalSystem;
    // Ajustada: soma de volta o vale/retirada, que explica dinheiro que
    // saiu do caixa antes do depósito.
    const adjustedDiff = rawDiff + num(form.withdrawalAmount);

    const diffStatus = useMemo(() => {
        if (Math.abs(adjustedDiff) < 0.01) return 'ok' as const;
        if (adjustedDiff < 0) return 'falta' as const;
        return 'sobra' as const;
    }, [adjustedDiff]);

    async function handleSave() {
        if (!activeStore) return;

        if (!form.date) {
            toast.error('Escolha a data da conciliação.');
            return;
        }

        try {
            setSaving(true);
            const response = await api.post('/cash-reconciliation', {
                storeId: activeStore.id,
                date: form.date,
                systemCash: num(form.systemCash),
                systemDebit: num(form.systemDebit),
                systemCredit: num(form.systemCredit),
                bankCash: num(form.bankCash),
                bankDebit: num(form.bankDebit),
                bankCredit: num(form.bankCredit),
                otherSystem: num(form.otherSystem),
                otherBank: num(form.otherBank),
                otherDescription: form.otherDescription || undefined,
                withdrawalAmount: num(form.withdrawalAmount),
                withdrawalReason: form.withdrawalReason || undefined,
                notes: form.notes || undefined,
            });

            setForm((current) => ({ ...current, id: response.data.id }));
            toast.success('Conciliação salva.');
            loadList(1);
            setPage(1);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar a conciliação.';
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }

    async function handleDownloadPdf() {
        if (!form.id) return;

        try {
            setDownloading(true);
            const response = await api.get(
                `/cash-reconciliation/${form.id}/report`,
                { responseType: 'blob' },
            );
            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data]),
            );
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `conciliacao-caixa-${form.date}.pdf`;
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            toast.error('Erro ao gerar o PDF da conciliação.');
        } finally {
            setDownloading(false);
        }
    }

    if (!activeStore) {
        return (
            <AppLayout title="Conciliação de Caixa">
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Selecione uma loja ativa no topo do sistema.
                </div>
            </AppLayout>
        );
    }

    const rows: Array<{
        key: 'Cash' | 'Debit' | 'Credit';
        label: string;
    }> = [
            { key: 'Cash', label: 'Dinheiro' },
            { key: 'Debit', label: 'Débito' },
            { key: 'Credit', label: 'Crédito' },
        ];

    return (
        <AppLayout title="Conciliação de Caixa">
            <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-bold">
                            Conciliação de Caixa
                        </h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            {activeStore.name} — compare o que o sistema
                            registrou com o que caiu no banco, dia a dia.
                        </p>
                    </div>

                    <button
                        onClick={startNew}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        <Plus size={16} />
                        Novo dia
                    </button>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <CalendarDays
                            size={18}
                            className="text-zinc-400"
                        />
                        <input
                            type="date"
                            value={form.date}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    date: event.target.value,
                                }))
                            }
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                        />
                        {form.id && (
                            <span className="text-xs text-zinc-500">
                                Editando conciliação salva — salvar novamente
                                atualiza este registro.
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto rounded-xl bg-zinc-50 dark:bg-zinc-800/50">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-zinc-500">
                                    <th className="px-4 pt-4 pb-2 font-medium">
                                        Forma de pagamento
                                    </th>
                                    <th className="px-4 pt-4 pb-2 text-right font-medium">
                                        Sistema
                                    </th>
                                    <th className="px-4 pt-4 pb-2 text-right font-medium">
                                        Banco
                                    </th>
                                    <th className="px-4 pt-4 pb-2 text-right font-medium">
                                        Diferença
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(({ key, label }) => {
                                    const systemValue = num(
                                        (form as any)[`system${key}`],
                                    );
                                    const bankValue = num(
                                        (form as any)[`bank${key}`],
                                    );
                                    const rowDiff = bankValue - systemValue;
                                    const rowOk = Math.abs(rowDiff) < 0.01;

                                    return (
                                        <tr
                                            key={key}
                                            className={
                                                rowOk
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                                    : 'bg-red-50 dark:bg-red-900/20'
                                            }
                                        >
                                            <td className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                                                {label}
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={
                                                        (form as any)[
                                                        `system${key}`
                                                        ]
                                                    }
                                                    onChange={(event) =>
                                                        setForm(
                                                            (current) => ({
                                                                ...current,
                                                                [`system${key}`]:
                                                                    event
                                                                        .target
                                                                        .value,
                                                            }),
                                                        )
                                                    }
                                                    className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={
                                                        (form as any)[
                                                        `bank${key}`
                                                        ]
                                                    }
                                                    onChange={(event) =>
                                                        setForm(
                                                            (current) => ({
                                                                ...current,
                                                                [`bank${key}`]:
                                                                    event
                                                                        .target
                                                                        .value,
                                                            }),
                                                        )
                                                    }
                                                    className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </td>
                                            <td
                                                className={`px-4 py-2 text-right font-medium ${rowOk
                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                    : 'text-red-700 dark:text-red-300'
                                                    }`}
                                            >
                                                {rowDiff < 0
                                                    ? '-'
                                                    : rowDiff > 0
                                                        ? '+'
                                                        : ''}
                                                {formatCurrency(
                                                    Math.abs(rowDiff),
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {/* Outros — forma de recebimento que não se encaixa nas 3 fixas
                                    (voucher, PIX manual, app de entrega etc). Com campo de
                                    descrição pra identificar o que foi lançado. */}
                                {(() => {
                                    const systemValue = num(form.otherSystem);
                                    const bankValue = num(form.otherBank);
                                    const rowDiff = bankValue - systemValue;
                                    const rowOk = Math.abs(rowDiff) < 0.01;

                                    return (
                                        <tr
                                            className={
                                                rowOk
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                                    : 'bg-red-50 dark:bg-red-900/20'
                                            }
                                        >
                                            <td className="px-4 py-2 font-medium text-zinc-700 dark:text-zinc-300">
                                                <div>Outros</div>
                                                <input
                                                    type="text"
                                                    value={form.otherDescription}
                                                    onChange={(event) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            otherDescription:
                                                                event.target
                                                                    .value,
                                                        }))
                                                    }
                                                    placeholder="O que é? (ex: voucher, PIX manual...)"
                                                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-normal dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right align-top">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={form.otherSystem}
                                                    onChange={(event) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            otherSystem:
                                                                event.target
                                                                    .value,
                                                        }))
                                                    }
                                                    className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right align-top">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={form.otherBank}
                                                    onChange={(event) =>
                                                        setForm((current) => ({
                                                            ...current,
                                                            otherBank:
                                                                event.target
                                                                    .value,
                                                        }))
                                                    }
                                                    className="w-32 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </td>
                                            <td
                                                className={`px-4 py-2 text-right align-top font-medium ${rowOk
                                                    ? 'text-emerald-700 dark:text-emerald-300'
                                                    : 'text-red-700 dark:text-red-300'
                                                    }`}
                                            >
                                                {rowDiff < 0
                                                    ? '-'
                                                    : rowDiff > 0
                                                        ? '+'
                                                        : ''}
                                                {formatCurrency(
                                                    Math.abs(rowDiff),
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })()}

                                <tr className="border-t border-zinc-200 dark:border-zinc-700">
                                    <td className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                                        Total
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold">
                                        {formatCurrency(totalSystem)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold">
                                        {formatCurrency(totalBank)}
                                    </td>
                                    <td
                                        className={`px-4 py-2 text-right font-semibold ${Math.abs(rawDiff) < 0.01
                                            ? 'text-emerald-700 dark:text-emerald-300'
                                            : rawDiff < 0
                                                ? 'text-red-700 dark:text-red-300'
                                                : 'text-amber-700 dark:text-amber-300'
                                            }`}
                                    >
                                        {rawDiff < 0 ? '-' : rawDiff > 0 ? '+' : ''}
                                        {formatCurrency(Math.abs(rawDiff))}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Vale ou retirada — dinheiro que saiu do caixa durante o dia
                        (sangria, adiantamento, despesa paga na hora). Abate do que
                        seria esperado no banco, pra não aparecer como diferença
                        "sem explicação". */}
                    <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
                        <p className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                            Vale ou retirada do caixa (opcional)
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.withdrawalAmount}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        withdrawalAmount: event.target.value,
                                    }))
                                }
                                placeholder="Valor retirado"
                                className="w-40 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                            <input
                                type="text"
                                value={form.withdrawalReason}
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        withdrawalReason: event.target.value,
                                    }))
                                }
                                placeholder="Motivo (ex: sangria, adiantamento...)"
                                className="min-w-[220px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            />
                        </div>
                    </div>

                    <div
                        className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 ${diffStatus === 'ok'
                                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                : diffStatus === 'falta'
                                    ? 'bg-red-50 dark:bg-red-900/20'
                                    : 'bg-amber-50 dark:bg-amber-900/20'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <CheckCircle2
                                size={18}
                                className={
                                    diffStatus === 'ok'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : diffStatus === 'falta'
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                }
                            />
                            <span className="text-sm font-medium">
                                {diffStatus === 'ok'
                                    ? 'Bateu certinho'
                                    : diffStatus === 'falta'
                                        ? 'Faltou cair no banco'
                                        : 'Sobrou no banco'}
                            </span>
                        </div>
                        <span
                            className={`text-lg font-bold ${diffStatus === 'ok'
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : diffStatus === 'falta'
                                        ? 'text-red-700 dark:text-red-300'
                                        : 'text-amber-700 dark:text-amber-300'
                                }`}
                        >
                            {adjustedDiff < 0 ? '-' : adjustedDiff > 0 ? '+' : ''}
                            {formatCurrency(Math.abs(adjustedDiff))}
                        </span>
                    </div>

                    <div className="mt-4">
                        <label className="mb-1 block text-sm text-zinc-600 dark:text-zinc-400">
                            Observações (opcional)
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    notes: event.target.value,
                                }))
                            }
                            rows={2}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                            placeholder="Ex: diferença de troco, depósito feito no dia seguinte..."
                        />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                            <Calculator size={16} />
                            {saving ? 'Salvando...' : 'Salvar conciliação'}
                        </button>

                        <button
                            onClick={handleDownloadPdf}
                            disabled={!form.id || downloading}
                            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                            <Download size={16} />
                            {downloading ? 'Gerando...' : 'Baixar PDF'}
                        </button>

                        {!form.id && (
                            <span className="text-xs text-zinc-500">
                                Salve pra poder baixar o PDF.
                            </span>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mb-3 flex items-center gap-2">
                        <Landmark size={18} className="text-zinc-400" />
                        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                            Últimas conciliações
                        </p>
                    </div>

                    {loadingList ? (
                        <p className="py-6 text-center text-sm text-zinc-500">
                            Carregando...
                        </p>
                    ) : items.length === 0 ? (
                        <p className="py-6 text-center text-sm text-zinc-500">
                            Nenhuma conciliação lançada ainda.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-zinc-500">
                                        <th className="pb-2 pr-4">Data</th>
                                        <th className="pb-2 pr-4 text-right">
                                            Sistema
                                        </th>
                                        <th className="pb-2 pr-4 text-right">
                                            Banco
                                        </th>
                                        <th className="pb-2 pr-4 text-right">
                                            Diferença
                                        </th>
                                        <th className="pb-2 pr-4">
                                            Lançado por
                                        </th>
                                        <th className="pb-2 text-right">
                                            Ações
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((item) => {
                                        const { system, bank, adjustedDiff: rowDiff } =
                                            totalsOf(item);
                                        const active = item.id === form.id;

                                        return (
                                            <tr
                                                key={item.id}
                                                className={`border-t border-zinc-100 dark:border-zinc-800 ${active
                                                        ? 'bg-zinc-100 dark:bg-zinc-800'
                                                        : ''
                                                    }`}
                                            >
                                                <td
                                                    onClick={() =>
                                                        selectRow(item)
                                                    }
                                                    className="cursor-pointer py-2 pr-4 hover:underline"
                                                >
                                                    {formatDate(item.date)}
                                                </td>
                                                <td
                                                    onClick={() =>
                                                        selectRow(item)
                                                    }
                                                    className="cursor-pointer py-2 pr-4 text-right"
                                                >
                                                    {formatCurrency(system)}
                                                </td>
                                                <td
                                                    onClick={() =>
                                                        selectRow(item)
                                                    }
                                                    className="cursor-pointer py-2 pr-4 text-right"
                                                >
                                                    {formatCurrency(bank)}
                                                </td>
                                                <td
                                                    onClick={() =>
                                                        selectRow(item)
                                                    }
                                                    className={`cursor-pointer py-2 pr-4 text-right font-medium ${Math.abs(
                                                        rowDiff,
                                                    ) < 0.01
                                                            ? 'text-emerald-600 dark:text-emerald-400'
                                                            : rowDiff < 0
                                                                ? 'text-red-600 dark:text-red-400'
                                                                : 'text-amber-600 dark:text-amber-400'
                                                        }`}
                                                >
                                                    {rowDiff < 0
                                                        ? '-'
                                                        : rowDiff > 0
                                                            ? '+'
                                                            : ''}
                                                    {formatCurrency(
                                                        Math.abs(rowDiff),
                                                    )}
                                                </td>
                                                <td
                                                    onClick={() =>
                                                        selectRow(item)
                                                    }
                                                    className="cursor-pointer py-2 pr-4 text-zinc-500"
                                                >
                                                    {item.launchedBy?.name ||
                                                        '—'}
                                                </td>
                                                <td className="py-2 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() =>
                                                                selectRow(item)
                                                            }
                                                            title="Editar"
                                                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                handleDelete(
                                                                    item.id,
                                                                )
                                                            }
                                                            disabled={
                                                                deletingId ===
                                                                item.id
                                                            }
                                                            title="Excluir"
                                                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 dark:hover:bg-red-900/20"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <Pagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                    />
                </div>
            </div>
        </AppLayout>
    );
}
