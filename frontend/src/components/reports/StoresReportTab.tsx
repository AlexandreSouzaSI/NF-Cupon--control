'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
    AlertTriangle,
    Building2,
    CheckCircle2,
    ReceiptText,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type StoreReport = {
    storeId: string;
    storeName: string;
    totalPurchases: number;
    totalValue: number;
    pendingApprovals: number;
    waitingInvoices: number;
    invoiceLinked: number;
    canceled: number;
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function StoresReportTab() {
    const [reports, setReports] = useState<StoreReport[]>([]);
    const [loading, setLoading] = useState(true);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    async function loadReports() {
        try {
            setLoading(true);

            const response = await api.get('/reports/stores', {
                params: {
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                },
            });

            setReports(response.data);
        } catch {
            toast.error('Erro ao carregar relatório por loja');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadReports();
    }, []);

    const totalValue = reports.reduce((sum, item) => sum + item.totalValue, 0);
    const totalPurchases = reports.reduce(
        (sum, item) => sum + item.totalPurchases,
        0,
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Período:
                </span>

                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                />

                <span className="text-zinc-500">até</span>

                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                />

                <button
                    onClick={loadReports}
                    className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-zinc-900 dark:text-white hover:bg-emerald-700"
                >
                    Filtrar
                </button>
            </div>

            <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-center">
                <div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Total comprado
                    </p>
                    <strong className="mt-1 block text-xl text-emerald-500 sm:text-2xl">
                        {formatCurrency(totalValue)}
                    </strong>
                </div>

                <div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Compras
                    </p>
                    <strong className="mt-1 block text-xl sm:text-2xl">
                        {totalPurchases}
                    </strong>
                </div>
            </div>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <h2 className="text-lg font-bold">Por loja</h2>

                    <Building2 className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
                ) : reports.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma compra encontrada no período.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        {reports.map((store) => (
                            <div
                                key={store.storeId}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5"
                            >
                                <h3 className="text-lg font-bold">{store.storeName}</h3>

                                <p className="mt-2 text-2xl font-bold text-emerald-500">
                                    {formatCurrency(store.totalValue)}
                                </p>

                                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                    {store.totalPurchases} compra(s)
                                </p>

                                <div className="mt-4 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2 text-yellow-400">
                                            <AlertTriangle size={16} />
                                            Aprovação
                                        </span>
                                        <strong>{store.pendingApprovals}</strong>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2 text-orange-400">
                                            <ReceiptText size={16} />
                                            Sem NF
                                        </span>
                                        <strong>{store.waitingInvoices}</strong>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2 text-emerald-500">
                                            <CheckCircle2 size={16} />
                                            NF vinculada
                                        </span>
                                        <strong>{store.invoiceLinked}</strong>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2 text-red-400">
                                            <XCircle size={16} />
                                            Canceladas
                                        </span>
                                        <strong>{store.canceled}</strong>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
