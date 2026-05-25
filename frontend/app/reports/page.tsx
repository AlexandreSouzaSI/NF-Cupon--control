'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    AlertTriangle,
    Building2,
    Clock,
    ReceiptText,
} from 'lucide-react';
import { toast } from 'sonner';

type SupplierReport = {
    id: string;
    name: string;
    cnpj?: string | null;
    totalPurchases: number;
    totalValue: number;
    waitingInvoices: number;
    pendingApprovals: number;
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function ReportsPage() {
    const [reports, setReports] = useState<SupplierReport[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadReports() {
        try {
            setLoading(true);

            const response = await api.get('/reports/suppliers');

            setReports(response.data);
        } catch {
            toast.error('Erro ao carregar relatórios');
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

    const totalWaitingInvoices = reports.reduce(
        (sum, item) => sum + item.waitingInvoices,
        0,
    );

    const totalPendingApprovals = reports.reduce(
        (sum, item) => sum + item.pendingApprovals,
        0,
    );

    return (
        <AppLayout title="Relatórios">
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <ReceiptText className="text-green-400" />
                        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
                            fornecedores
                        </span>
                    </div>

                    <p className="text-sm text-zinc-400">Total comprado</p>
                    <strong className="mt-2 block text-3xl text-green-400">
                        {formatCurrency(totalValue)}
                    </strong>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <AlertTriangle className="text-orange-400" />
                        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
                            fiscal
                        </span>
                    </div>

                    <p className="text-sm text-zinc-400">Cupons sem NF</p>
                    <strong className="mt-2 block text-3xl text-orange-400">
                        {totalWaitingInvoices}
                    </strong>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <Clock className="text-yellow-400" />
                        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
                            aprovação
                        </span>
                    </div>

                    <p className="text-sm text-zinc-400">Aguardando aprovação</p>
                    <strong className="mt-2 block text-3xl text-yellow-400">
                        {totalPendingApprovals}
                    </strong>
                </div>
            </div>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Compras por fornecedor
                        </h2>
                        <p className="text-sm text-zinc-400">
                            Veja valor comprado, pendências fiscais e aprovações
                        </p>
                    </div>

                    <Building2 className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-400">Carregando...</p>
                ) : reports.length === 0 ? (
                    <p className="text-sm text-zinc-400">
                        Nenhum fornecedor com compra registrada.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {reports.map((supplier) => (
                            <div
                                key={supplier.id}
                                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <h3 className="font-semibold">{supplier.name}</h3>

                                        <p className="mt-1 text-sm text-zinc-400">
                                            CNPJ: {supplier.cnpj || 'Não informado'}
                                        </p>

                                        <p className="mt-1 text-sm text-zinc-500">
                                            {supplier.totalPurchases} compra(s) registrada(s)
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3 md:text-right">
                                        <div>
                                            <p className="text-zinc-500">Valor</p>
                                            <strong className="text-green-400">
                                                {formatCurrency(supplier.totalValue)}
                                            </strong>
                                        </div>

                                        <div>
                                            <p className="text-zinc-500">Sem NF</p>
                                            <strong className="text-orange-400">
                                                {supplier.waitingInvoices}
                                            </strong>
                                        </div>

                                        <div>
                                            <p className="text-zinc-500">Aprovações</p>
                                            <strong className="text-yellow-400">
                                                {supplier.pendingApprovals}
                                            </strong>
                                        </div>
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