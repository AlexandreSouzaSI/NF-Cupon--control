'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import {
    CheckCircle2,
    FileText,
    ReceiptText,
    Search,
} from 'lucide-react';
import { toast } from 'sonner';

type Purchase = {
    id: string;
    description: string;
    value: string;
    status: string;
    createdAt: string;
    store: { name: string };
    supplier?: { name: string } | null;
    createdBy: { name: string };
    fiscalDocuments?: {
        id: string;
        type: 'COUPON' | 'INVOICE';
        fileUrl?: string | null;
    }[];
};

const statusLabel: Record<string, string> = {
    PURCHASED: 'Aprovada',
    WAITING_INVOICE: 'Aguardando NF',
    HAS_INVOICE: 'NF vinculada',
    RECEIVED_OK: 'Conferida',
    CLOSED: 'Fechada',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function PurchaseManagementPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');

    async function loadPurchases() {
        try {
            setLoading(true);

            const response = await api.get('/purchases', {
                params: {
                    status: statusFilter || undefined,
                },
            });

            const operationalPurchases = response.data.filter((purchase: Purchase) =>
                ['PURCHASED', 'WAITING_INVOICE', 'HAS_INVOICE', 'RECEIVED_OK', 'CLOSED'].includes(
                    purchase.status,
                ),
            );

            setPurchases(operationalPurchases);
        } catch {
            toast.error('Erro ao carregar compras');
        } finally {
            setLoading(false);
        }
    }

    async function checkPurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/check`);
            toast.success('Compra conferida');
            await loadPurchases();
        } catch {
            toast.error('Erro ao conferir compra');
        }
    }

    async function closePurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/close`);
            toast.success('Compra fechada');
            await loadPurchases();
        } catch {
            toast.error('Erro ao fechar compra');
        }
    }

    useEffect(() => {
        loadPurchases();
    }, [statusFilter]);

    return (
        <AppLayout title="Compras">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <ReceiptText size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Gestão de compras</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Acompanhe compras aprovadas, cupons, notas fiscais e fechamento.
                        </p>
                    </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                    >
                        <option value="">Todos os status</option>
                        <option value="PURCHASED">Aprovadas</option>
                        <option value="WAITING_INVOICE">Aguardando NF</option>
                        <option value="HAS_INVOICE">NF vinculada</option>
                        <option value="RECEIVED_OK">Conferidas</option>
                        <option value="CLOSED">Fechadas</option>
                    </select>

                    <button
                        onClick={loadPurchases}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-zinc-900 dark:text-white hover:bg-green-600"
                    >
                        <Search size={18} />
                        Buscar
                    </button>
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
                ) : purchases.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma compra operacional encontrada.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {purchases.map((purchase) => (
                            <div
                                key={purchase.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div>
                                        <h3 className="font-semibold">{purchase.description}</h3>

                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            {purchase.store.name} • {purchase.createdBy.name}
                                            {purchase.supplier?.name &&
                                                ` • ${purchase.supplier.name}`}
                                        </p>

                                        <p className="mt-1 text-sm text-zinc-500">
                                            {new Date(purchase.createdAt).toLocaleDateString('pt-BR')}
                                        </p>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {purchase.fiscalDocuments?.map((doc) => {
                                                if (!doc.fileUrl) return null;

                                                return (
                                                    <a
                                                        key={doc.id}
                                                        href={`${API_URL}${doc.fileUrl}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
                                                    >
                                                        <FileText size={16} />
                                                        Abrir {doc.type === 'COUPON' ? 'cupom' : 'NF'}
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="md:text-right">
                                        <strong className="block text-xl text-green-400">
                                            {formatCurrency(purchase.value)}
                                        </strong>

                                        <span className="mt-2 inline-flex rounded-full bg-white dark:bg-zinc-900 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">
                                            {statusLabel[purchase.status] || purchase.status}
                                        </span>

                                        {purchase.status === 'HAS_INVOICE' && (
                                            <button
                                                onClick={() => checkPurchase(purchase.id)}
                                                className="mt-3 block w-full rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20 md:w-auto"
                                            >
                                                Conferir compra
                                            </button>
                                        )}

                                        {purchase.status === 'RECEIVED_OK' && (
                                            <button
                                                onClick={() => closePurchase(purchase.id)}
                                                className="mt-3 block w-full rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20 md:w-auto"
                                            >
                                                Fechar compra
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </AppLayout>
    );
}