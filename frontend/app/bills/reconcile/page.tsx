'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Ban,
    CheckCircle2,
    FileUp,
    Landmark,
    Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

type Bill = {
    id: string;
    description: string;
    value: string;
    dueDate: string;
    status: string;
    supplier?: { name: string } | null;
};

type OfxTransaction = {
    fitId: string;
    type: string;
    postedAt: string;
    amount: number;
    description: string;
};

type RowStatus = 'PENDING' | 'CONFIRMED' | 'IGNORED';

function formatCurrency(value: string | number) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value: string) {
    return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

export default function BillsReconcilePage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [openBills, setOpenBills] = useState<Bill[]>([]);
    const [loadingBills, setLoadingBills] = useState(true);
    const [uploading, setUploading] = useState(false);

    const [transactions, setTransactions] = useState<OfxTransaction[]>([]);
    const [selectedBillId, setSelectedBillId] = useState<
        Record<string, string>
    >({});
    const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>(
        {},
    );
    const [processingFitId, setProcessingFitId] = useState<string | null>(
        null,
    );

    async function loadOpenBills() {
        try {
            setLoadingBills(true);

            const response = await api.get('/bills', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    status: 'OPEN',
                },
            });

            setOpenBills(response.data || []);
        } catch {
            toast.error('Erro ao carregar contas em aberto.');
        } finally {
            setLoadingBills(false);
        }
    }

    useEffect(() => {
        loadOpenBills();
    }, []);

    // Contas já usadas em alguma linha confirmada não devem aparecer como
    // sugestão pras outras transações.
    const usedBillIds = useMemo(() => {
        return new Set(
            Object.entries(rowStatus)
                .filter(([, status]) => status === 'CONFIRMED')
                .map(([fitId]) => selectedBillId[fitId])
                .filter(Boolean),
        );
    }, [rowStatus, selectedBillId]);

    const availableBills = useMemo(
        () => openBills.filter((bill) => !usedBillIds.has(bill.id)),
        [openBills, usedBillIds],
    );

    async function handleFileChange(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.target.files?.[0];

        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setUploading(true);

            const response = await api.post(
                '/bills/reconcile/import',
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                },
            );

            const allTransactions: OfxTransaction[] =
                response.data?.transactions || [];

            // Conta a pagar é dinheiro saindo — olhamos só os débitos do
            // extrato, que é o que pode corresponder a uma conta paga.
            const debits = allTransactions
                .filter((transaction) => transaction.amount < 0)
                .sort((a, b) => a.postedAt.localeCompare(b.postedAt));

            setTransactions(debits);

            const initialSelection: Record<string, string> = {};

            for (const transaction of debits) {
                const candidates = openBills.filter(
                    (bill) =>
                        Math.abs(
                            Number(bill.value) -
                            Math.abs(transaction.amount),
                        ) < 0.01,
                );

                if (candidates.length === 1) {
                    initialSelection[transaction.fitId] = candidates[0].id;
                }
            }

            setSelectedBillId(initialSelection);
            setRowStatus({});

            const skipped = allTransactions.length - debits.length;

            toast.success(
                `${debits.length} saída(s) encontrada(s) no extrato` +
                (skipped > 0
                    ? ` (${skipped} entrada(s) ignorada(s)).`
                    : '.'),
            );
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao ler o arquivo OFX.',
            );
        } finally {
            setUploading(false);

            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }

    async function confirmMatch(transaction: OfxTransaction) {
        const billId = selectedBillId[transaction.fitId];

        if (!billId) {
            toast.error('Selecione a conta correspondente antes de confirmar.');
            return;
        }

        try {
            setProcessingFitId(transaction.fitId);

            await api.patch(`/bills/${billId}/pay`, {
                paidAt: transaction.postedAt,
                reconciliationNote: `Conciliado via extrato OFX: "${transaction.description}" (${formatCurrency(Math.abs(transaction.amount))} em ${formatDate(transaction.postedAt)}).`,
            });

            setRowStatus((current) => ({
                ...current,
                [transaction.fitId]: 'CONFIRMED',
            }));

            toast.success('Conta marcada como paga.');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao confirmar pagamento.',
            );
        } finally {
            setProcessingFitId(null);
        }
    }

    function ignoreTransaction(fitId: string) {
        setRowStatus((current) => ({
            ...current,
            [fitId]: 'IGNORED',
        }));
    }

    const pendingCount = transactions.filter(
        (transaction) =>
            !rowStatus[transaction.fitId] ||
            rowStatus[transaction.fitId] === 'PENDING',
    ).length;

    return (
        <AppLayout title="Conciliação bancária">
            <div className="space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <button
                            onClick={() => router.push('/bills')}
                            className="mb-2 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                        >
                            <ArrowLeft size={16} />
                            Voltar para Contas a Pagar
                        </button>

                        <h2 className="text-2xl font-bold">
                            Conciliação bancária
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Importe o extrato (.ofx) do banco e confirme quais
                            contas em aberto já foram pagas.
                        </p>
                    </div>

                    <div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".ofx"
                            className="hidden"
                            onChange={handleFileChange}
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading || loadingBills}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {uploading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <FileUp size={18} />
                            )}
                            {transactions.length > 0
                                ? 'Importar outro extrato'
                                : 'Importar extrato OFX'}
                        </button>
                    </div>
                </div>

                {transactions.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-10 text-center">
                        <Landmark className="mx-auto mb-3 text-zinc-500" />

                        <h3 className="text-lg font-bold">
                            Nenhum extrato importado ainda
                        </h3>

                        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
                            Exporte o extrato do internet banking em formato
                            OFX e importe aqui. A gente sugere qual conta em
                            aberto bate com cada saída — você só confirma.
                        </p>

                        {!loadingBills && openBills.length === 0 && (
                            <p className="mt-4 text-sm text-yellow-500">
                                Não há contas em aberto nessa loja pra
                                conciliar no momento.
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm text-zinc-600 dark:text-zinc-400">
                            {pendingCount} de {transactions.length} saída(s)
                            ainda pendente(s) de conferência.
                        </div>

                        <div className="space-y-3">
                            {transactions.map((transaction) => {
                                const status =
                                    rowStatus[transaction.fitId] || 'PENDING';
                                const isProcessing =
                                    processingFitId === transaction.fitId;

                                return (
                                    <div
                                        key={transaction.fitId}
                                        className={`rounded-3xl border p-5 ${status === 'CONFIRMED'
                                            ? 'border-emerald-500/30 bg-emerald-500/5'
                                            : status === 'IGNORED'
                                                ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 opacity-60'
                                                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                            }`}
                                    >
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold">
                                                    {transaction.description}
                                                </p>
                                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                    {formatDate(
                                                        transaction.postedAt,
                                                    )}{' '}
                                                    •{' '}
                                                    <span className="font-medium text-red-400">
                                                        {formatCurrency(
                                                            Math.abs(
                                                                transaction.amount,
                                                            ),
                                                        )}
                                                    </span>
                                                </p>
                                            </div>

                                            {status === 'CONFIRMED' ? (
                                                <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
                                                    <CheckCircle2 size={16} />
                                                    Conciliada
                                                </span>
                                            ) : status === 'IGNORED' ? (
                                                <span className="inline-flex items-center gap-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
                                                    <Ban size={16} />
                                                    Ignorada
                                                </span>
                                            ) : (
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                    <select
                                                        value={
                                                            selectedBillId[
                                                            transaction.fitId
                                                            ] || ''
                                                        }
                                                        onChange={(event) =>
                                                            setSelectedBillId(
                                                                (current) => ({
                                                                    ...current,
                                                                    [transaction.fitId]:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                }),
                                                            )
                                                        }
                                                        className="h-11 min-w-[260px] rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                                                    >
                                                        <option value="">
                                                            Selecionar conta
                                                            correspondente
                                                        </option>

                                                        {availableBills.map(
                                                            (bill) => (
                                                                <option
                                                                    key={
                                                                        bill.id
                                                                    }
                                                                    value={
                                                                        bill.id
                                                                    }
                                                                >
                                                                    {
                                                                        bill.description
                                                                    }
                                                                    {bill.supplier
                                                                        ?.name
                                                                        ? ` • ${bill.supplier.name}`
                                                                        : ''}{' '}
                                                                    •{' '}
                                                                    {formatCurrency(
                                                                        bill.value,
                                                                    )}{' '}
                                                                    • vence{' '}
                                                                    {formatDate(
                                                                        bill.dueDate.slice(
                                                                            0,
                                                                            10,
                                                                        ),
                                                                    )}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>

                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() =>
                                                                confirmMatch(
                                                                    transaction,
                                                                )
                                                            }
                                                            disabled={
                                                                isProcessing ||
                                                                !selectedBillId[
                                                                transaction
                                                                    .fitId
                                                                ]
                                                            }
                                                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                                                        >
                                                            {isProcessing ? (
                                                                <Loader2
                                                                    size={16}
                                                                    className="animate-spin"
                                                                />
                                                            ) : (
                                                                <CheckCircle2
                                                                    size={16}
                                                                />
                                                            )}
                                                            Confirmar
                                                        </button>

                                                        <button
                                                            onClick={() =>
                                                                ignoreTransaction(
                                                                    transaction.fitId,
                                                                )
                                                            }
                                                            className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                            title="Não corresponde a nenhuma conta"
                                                        >
                                                            <Ban size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
