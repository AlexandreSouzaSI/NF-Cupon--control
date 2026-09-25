'use client';

import { useEffect, useState } from 'react';

import { AppLayout } from '../../src/components/app-layout';

import { api } from '@/lib/api';

import {
    Check,
    Clock3,
    RotateCcw,
    Trash2,
    X,
    XCircle,
} from 'lucide-react';

import { toast } from 'sonner';

type Approval = {
    id: string;
    status: 'APPROVED' | 'REJECTED';
    comment?: string | null;
    approver?: { name: string } | null;
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    method: string;
    status: string;
    createdAt: string;
    notes?: string | null;
    rejectionReason?: string | null;
    rejectedAt?: string | null;
    approvals?: Approval[];

    store: {
        name: string;
    };

    createdBy: {
        name: string;
    };

    bills?: { id: string }[];
    incomingGoodsNfs?: { id: string }[];
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString(
        'pt-BR',
        {
            style: 'currency',
            currency: 'BRL',
        },
    );
}

// Reprovada nunca teve nem NF nem conta a pagar vinculada (senão nem
// chegaria a ser reprovada por esse fluxo) — mas por segurança, só deixa
// excluir se de fato não tiver nada vinculado; senão só sobra "aprovar de
// novo".
function canDeleteRejected(purchase: Purchase) {
    return (
        (purchase.bills?.length || 0) === 0 &&
        (purchase.incomingGoodsNfs?.length || 0) === 0
    );
}

function lastRejectionOf(purchase: Purchase) {
    return [...(purchase.approvals || [])]
        .reverse()
        .find((approval) => approval.status === 'REJECTED');
}

export default function ApprovalsPage() {
    const [purchases, setPurchases] = useState<
        Purchase[]
    >([]);

    const [loading, setLoading] = useState(true);

    async function loadPurchases() {
        try {
            setLoading(true);

            const response = await api.get(
                '/purchases/pending-approvals',
            );

            setPurchases(response.data);
        } catch {
            toast.error(
                'Erro ao carregar aprovações',
            );
        } finally {
            setLoading(false);
        }
    }

    async function approve(id: string) {
        try {
            await api.post(`/purchases/${id}/approve`, {
                comment: '',
            });

            toast.success('Compra aprovada');

            await loadPurchases();
        } catch {
            toast.error('Erro ao aprovar');
        }
    }

    async function reject(id: string) {
        const comment = window.prompt(
            'Motivo da reprovação (opcional):',
        );

        if (comment === null) {
            return;
        }

        try {
            await api.post(`/purchases/${id}/reject`, {
                comment,
            });

            toast.success('Compra reprovada');

            await loadPurchases();
        } catch {
            toast.error('Erro ao reprovar');
        }
    }

    async function unreject(id: string) {
        try {
            await api.post(`/purchases/${id}/unreject`, {
                comment: '',
            });

            toast.success('Reprovação revertida — compra liberada de novo');

            await loadPurchases();
        } catch {
            toast.error('Erro ao reverter reprovação');
        }
    }

    async function remove(purchase: Purchase) {
        if (
            !window.confirm(
                `Excluir definitivamente a compra "${purchase.description}"? Essa ação não pode ser desfeita.`,
            )
        ) {
            return;
        }

        try {
            await api.post(`/purchases/${purchase.id}/delete`, {});

            toast.success('Compra excluída');

            await loadPurchases();
        } catch {
            toast.error('Erro ao excluir compra');
        }
    }

    useEffect(() => {
        loadPurchases();
    }, []);

    const pending = purchases.filter(
        (purchase) => purchase.status === 'WAITING_APPROVAL',
    );

    const rejected = purchases.filter(
        (purchase) => purchase.status === 'REJECTED',
    );

    return (
        <AppLayout title="Aprovações">
            <div className="space-y-8">
                <div>
                    <h2 className="mb-3 text-lg font-bold">
                        Aguardando aprovação
                    </h2>

                    {loading ? (
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Carregando...
                        </p>
                    ) : pending.length === 0 ? (
                        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                            <Clock3 className="mx-auto mb-3 text-zinc-500" />

                            <h3 className="text-xl font-bold">
                                Nenhuma aprovação pendente
                            </h3>

                            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                                Tudo sob controle no momento.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pending.map((purchase) => (
                                <div
                                    key={purchase.id}
                                    className="rounded-3xl border border-amber-500/40 bg-amber-500/5 p-5 dark:bg-amber-500/[0.06]"
                                >
                                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold">
                                                {purchase.description}
                                            </h3>

                                            <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                <p>
                                                    Loja:{' '}
                                                    {purchase.store.name}
                                                </p>

                                                <p>
                                                    Solicitado por:{' '}
                                                    {purchase.createdBy.name}
                                                </p>

                                                <p>
                                                    Forma pagamento:{' '}
                                                    {purchase.method}
                                                </p>
                                                {purchase.notes && (
                                                    <p className="mt-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm text-zinc-700 dark:text-zinc-300">
                                                        <strong className="text-zinc-800 dark:text-zinc-100">Observação:</strong> {purchase.notes}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="lg:text-right">
                                            <strong className="block text-3xl text-yellow-400">
                                                {formatCurrency(
                                                    purchase.value,
                                                )}
                                            </strong>

                                            <div className="mt-4 flex gap-3">
                                                <button
                                                    onClick={() =>
                                                        approve(purchase.id)
                                                    }
                                                    className="flex h-11 items-center gap-2 rounded-2xl bg-blue-500 px-5 font-medium text-white hover:bg-blue-600"
                                                >
                                                    <Check size={18} />
                                                    Aprovar
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        reject(purchase.id)
                                                    }
                                                    className="flex h-11 items-center gap-2 rounded-2xl bg-red-500 px-5 font-medium text-white hover:bg-red-600"
                                                >
                                                    <X size={18} />
                                                    Reprovar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <h2 className="mb-3 text-lg font-bold">
                        Reprovadas
                    </h2>

                    {loading ? null : rejected.length === 0 ? (
                        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                            <XCircle className="mx-auto mb-3 text-zinc-500" />

                            <h3 className="text-xl font-bold">
                                Nenhuma compra reprovada
                            </h3>

                            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                                Nada reprovado no momento.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {rejected.map((purchase) => {
                                const lastRejection = lastRejectionOf(purchase);

                                return (
                                    <div
                                        key={purchase.id}
                                        className="rounded-3xl border border-red-500/30 bg-red-500/5 p-5 dark:bg-red-500/[0.06]"
                                    >
                                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                            <div>
                                                <h3 className="text-xl font-bold">
                                                    {purchase.description}
                                                </h3>

                                                <div className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                    <p>
                                                        Loja:{' '}
                                                        {purchase.store.name}
                                                    </p>

                                                    <p>
                                                        Solicitado por:{' '}
                                                        {purchase.createdBy.name}
                                                    </p>

                                                    <p>
                                                        Forma pagamento:{' '}
                                                        {purchase.method}
                                                    </p>
                                                </div>

                                                <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
                                                    <p className="flex items-center gap-1 text-xs font-semibold text-red-400">
                                                        <XCircle size={12} />
                                                        Reprovada
                                                        {lastRejection?.approver?.name
                                                            ? ` por ${lastRejection.approver.name}`
                                                            : ''}
                                                    </p>

                                                    {(purchase.rejectionReason || lastRejection?.comment) && (
                                                        <p className="mt-1 text-xs text-red-400/90">
                                                            Motivo: {purchase.rejectionReason || lastRejection?.comment}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="lg:text-right">
                                                <strong className="block text-3xl text-yellow-400">
                                                    {formatCurrency(
                                                        purchase.value,
                                                    )}
                                                </strong>

                                                <div className="mt-4 flex flex-wrap gap-3 lg:justify-end">
                                                    <button
                                                        onClick={() =>
                                                            unreject(purchase.id)
                                                        }
                                                        className="flex h-11 items-center gap-2 rounded-2xl bg-blue-500 px-5 font-medium text-white hover:bg-blue-600"
                                                    >
                                                        <RotateCcw size={18} />
                                                        Aprovar de novo
                                                    </button>

                                                    {canDeleteRejected(purchase) && (
                                                        <button
                                                            onClick={() =>
                                                                remove(purchase)
                                                            }
                                                            className="flex h-11 items-center gap-2 rounded-2xl bg-red-500 px-5 font-medium text-white hover:bg-red-600"
                                                        >
                                                            <Trash2 size={18} />
                                                            Excluir
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
