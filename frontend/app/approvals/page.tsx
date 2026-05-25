'use client';

import { useEffect, useState } from 'react';

import { AppLayout } from '../../src/components/app-layout';

import { api } from '@/lib/api';

import {
    Check,
    Clock3,
    X,
} from 'lucide-react';

import { toast } from 'sonner';

type Purchase = {
    id: string;
    description: string;
    value: string;
    method: string;
    status: string;
    createdAt: string;
    notes?: string | null;

    store: {
        name: string;
    };

    createdBy: {
        name: string;
    };
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
        try {
            await api.post(`/purchases/${id}/reject`, {
                comment: '',
            });

            toast.success('Compra reprovada');

            await loadPurchases();
        } catch {
            toast.error('Erro ao reprovar');
        }
    }

    useEffect(() => {
        loadPurchases();
    }, []);

    return (
        <AppLayout title="Aprovações">
            <div className="space-y-4">
                {loading ? (
                    <p className="text-zinc-400">
                        Carregando...
                    </p>
                ) : purchases.length === 0 ? (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                        <Clock3 className="mx-auto mb-3 text-zinc-500" />

                        <h2 className="text-xl font-bold">
                            Nenhuma aprovação pendente
                        </h2>

                        <p className="mt-2 text-zinc-400">
                            Tudo sob controle no momento.
                        </p>
                    </div>
                ) : (
                    purchases.map((purchase) => (
                        <div
                            key={purchase.id}
                            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
                        >
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">
                                        {purchase.description}
                                    </h2>

                                    <div className="mt-3 space-y-1 text-sm text-zinc-400">
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
                                            <p className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                                                <strong className="text-zinc-100">Motivo:</strong> {purchase.notes}
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
                                            className="flex h-11 items-center gap-2 rounded-2xl bg-green-500 px-5 font-medium text-white hover:bg-green-600"
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
                    ))
                )}
            </div>
        </AppLayout>
    );
}