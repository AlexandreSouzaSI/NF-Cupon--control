'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    CalendarDays,
    CreditCard,
    ReceiptText,
    WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

type CardPurchase = {
    id: string;
    description: string;
    value: number;
    status: string;
    storeName: string;
    supplierName?: string | null;
    createdAt: string;
};

type CardReport = {
    cardId: string;
    cardName: string;
    lastDigits?: string | null;
    storeName: string;
    totalPurchases: number;
    totalValue: number;
    waitingInvoices: number;
    invoiceLinked: number;
    purchases: CardPurchase[];
};

const statusLabel: Record<string, string> = {
    PENDING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    PURCHASED: 'Comprada',
    WAITING_INVOICE: 'Aguardando NF',
    INVOICE_LINKED: 'NF vinculada',
    CHECKED: 'Conferida',
    CLOSED: 'Fechada',
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function CardReportsPage() {
    const [reports, setReports] = useState<CardReport[]>([]);
    const [loading, setLoading] = useState(true);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    async function loadReports() {
        try {
            setLoading(true);

            const response = await api.get('/reports/cards', {
                params: {
                    startDate: startDate || undefined,
                    endDate: endDate || undefined,
                },
            });

            setReports(response.data);
        } catch {
            toast.error('Erro ao carregar relatório por cartão');
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

    const totalWaitingInvoices = reports.reduce(
        (sum, item) => sum + item.waitingInvoices,
        0,
    );

    return (
        <AppLayout title="Relatório por Cartão">
            <div className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <CalendarDays size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">Período</h2>
                        <p className="text-sm text-zinc-400">
                            Filtre compras para bater com a fatura
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

            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <WalletCards className="mb-4 text-green-400" />
                    <p className="text-sm text-zinc-400">Total em cartões</p>
                    <strong className="mt-2 block text-3xl text-green-400">
                        {formatCurrency(totalValue)}
                    </strong>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <CreditCard className="mb-4 text-blue-400" />
                    <p className="text-sm text-zinc-400">Compras no cartão</p>
                    <strong className="mt-2 block text-3xl text-blue-400">
                        {totalPurchases}
                    </strong>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                    <ReceiptText className="mb-4 text-orange-400" />
                    <p className="text-sm text-zinc-400">Sem NF</p>
                    <strong className="mt-2 block text-3xl text-orange-400">
                        {totalWaitingInvoices}
                    </strong>
                </div>
            </div>

            <section className="space-y-4">
                {loading ? (
                    <p className="text-sm text-zinc-400">Carregando...</p>
                ) : reports.length === 0 ? (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                        <CreditCard className="mx-auto mb-3 text-zinc-500" />
                        <h2 className="text-xl font-bold">
                            Nenhuma compra com cartão encontrada
                        </h2>
                        <p className="mt-2 text-zinc-400">
                            Registre compras vinculadas a um cartão para aparecer aqui.
                        </p>
                    </div>
                ) : (
                    reports.map((card) => (
                        <div
                            key={card.cardId}
                            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
                        >
                            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 className="text-xl font-bold">{card.cardName}</h2>
                                    <p className="text-sm text-zinc-400">
                                        {card.storeName}
                                        {card.lastDigits && ` • final ${card.lastDigits}`}
                                    </p>
                                </div>

                                <div className="md:text-right">
                                    <p className="text-sm text-zinc-400">Total</p>
                                    <strong className="text-2xl text-green-400">
                                        {formatCurrency(card.totalValue)}
                                    </strong>
                                </div>
                            </div>

                            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                    <p className="text-sm text-zinc-400">Compras</p>
                                    <strong className="text-xl">{card.totalPurchases}</strong>
                                </div>

                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                    <p className="text-sm text-zinc-400">Sem NF</p>
                                    <strong className="text-xl text-orange-400">
                                        {card.waitingInvoices}
                                    </strong>
                                </div>

                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                    <p className="text-sm text-zinc-400">NF vinculada</p>
                                    <strong className="text-xl text-green-400">
                                        {card.invoiceLinked}
                                    </strong>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {card.purchases.map((purchase) => (
                                    <div
                                        key={purchase.id}
                                        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                                    >
                                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="font-medium">{purchase.description}</p>
                                                <p className="mt-1 text-sm text-zinc-400">
                                                    {purchase.storeName}
                                                    {purchase.supplierName &&
                                                        ` • ${purchase.supplierName}`}
                                                </p>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    {new Date(purchase.createdAt).toLocaleDateString(
                                                        'pt-BR',
                                                    )}
                                                </p>
                                            </div>

                                            <div className="md:text-right">
                                                <strong className="block text-lg text-green-400">
                                                    {formatCurrency(purchase.value)}
                                                </strong>
                                                <span className="text-xs text-zinc-400">
                                                    {statusLabel[purchase.status] || purchase.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </section>
        </AppLayout>
    );
}