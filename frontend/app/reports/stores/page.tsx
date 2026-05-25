'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    AlertTriangle,
    Building2,
    CalendarDays,
    CheckCircle2,
    ReceiptText,
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
    rejected: number;
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function StoreReportsPage() {
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

    const totalValue = reports.reduce(
        (sum, item) => sum + item.totalValue,
        0,
    );

    const totalPurchases = reports.reduce(
        (sum, item) => sum + item.totalPurchases,
        0,
    );

    return (
        <AppLayout title="Relatório por Loja">
            <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <CalendarDays size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Período</h2>
                        <p className="text-sm text-zinc-400">
                            Filtre compras por intervalo de datas
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                    />

                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-4 outline-none focus:border-green-500"
                    />

                    <button
                        onClick={loadReports}
                        className="h-12 rounded-xl bg-green-500 px-6 font-semibold text-white hover:bg-green-600"
                    >
                        Filtrar
                    </button>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <p className="text-sm text-zinc-400">Total comprado</p>
                    <strong className="mt-2 block text-3xl text-green-400">
                        {formatCurrency(totalValue)}
                    </strong>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <p className="text-sm text-zinc-400">Quantidade de compras</p>
                    <strong className="mt-2 block text-3xl text-blue-400">
                        {totalPurchases}
                    </strong>
                </div>
            </div>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Resultado por loja</h2>
                        <p className="text-sm text-zinc-400">
                            Visão para conciliação mensal
                        </p>
                    </div>

                    <Building2 className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-400">Carregando...</p>
                ) : reports.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                        Nenhuma compra encontrada no período.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                        {reports.map((store) => (
                            <div
                                key={store.storeId}
                                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                            >
                                <h3 className="text-lg font-bold">{store.storeName}</h3>

                                <p className="mt-2 text-3xl font-bold text-green-400">
                                    {formatCurrency(store.totalValue)}
                                </p>

                                <p className="mt-1 text-sm text-zinc-400">
                                    {store.totalPurchases} compra(s)
                                </p>

                                <div className="mt-5 space-y-3 text-sm">
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
                                        <span className="flex items-center gap-2 text-green-400">
                                            <CheckCircle2 size={16} />
                                            NF vinculada
                                        </span>
                                        <strong>{store.invoiceLinked}</strong>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-red-400">Reprovadas</span>
                                        <strong>{store.rejected}</strong>
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