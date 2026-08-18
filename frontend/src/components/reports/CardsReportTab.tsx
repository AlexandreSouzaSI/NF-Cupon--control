'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
    ChevronDown,
    ChevronRight,
    CreditCard,
} from 'lucide-react';
import { toast } from 'sonner';

type CardPurchase = {
    id: string;
    description: string;
    value: number;
    status: string;
    hasInvoice: boolean;
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
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida OK',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com diferença',
    WAITING_INVOICE: 'Aguardando NF',
    HAS_COUPON_ONLY: 'Apenas com cupom',
    HAS_INVOICE: 'Com NF',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function CardsReportTab() {
    const [reports, setReports] = useState<CardReport[]>([]);
    const [loading, setLoading] = useState(true);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [expandedCard, setExpandedCard] = useState<string | null>(null);

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

    const totalValue = reports.reduce((sum, item) => sum + item.totalValue, 0);
    const totalPurchases = reports.reduce(
        (sum, item) => sum + item.totalPurchases,
        0,
    );
    const totalWaitingInvoices = reports.reduce(
        (sum, item) => sum + item.waitingInvoices,
        0,
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Período (pra bater com a fatura):
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

            <div className="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-center">
                <div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Total em cartões
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

                <div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Sem NF
                    </p>
                    <strong className="mt-1 block text-xl text-orange-400 sm:text-2xl">
                        {totalWaitingInvoices}
                    </strong>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : reports.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                    <CreditCard className="mx-auto mb-3 text-zinc-500" />
                    <h2 className="text-lg font-bold">
                        Nenhuma compra com cartão encontrada
                    </h2>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        Registre compras vinculadas a um cartão para aparecer aqui.
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                    {reports.map((card) => {
                        const isExpanded = expandedCard === card.cardId;

                        return (
                            <div key={card.cardId}>
                                <button
                                    onClick={() =>
                                        setExpandedCard(
                                            isExpanded ? null : card.cardId,
                                        )
                                    }
                                    className="flex w-full flex-col gap-2 p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        {isExpanded ? (
                                            <ChevronDown
                                                size={18}
                                                className="shrink-0 text-zinc-500"
                                            />
                                        ) : (
                                            <ChevronRight
                                                size={18}
                                                className="shrink-0 text-zinc-500"
                                            />
                                        )}

                                        <div>
                                            <p className="font-semibold">
                                                {card.cardName}
                                                {card.lastDigits &&
                                                    ` • final ${card.lastDigits}`}
                                            </p>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                {card.storeName} •{' '}
                                                {card.totalPurchases} compra(s)
                                                {card.waitingInvoices > 0 && (
                                                    <span className="text-orange-400">
                                                        {' '}
                                                        • {card.waitingInvoices} sem NF
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <strong className="text-lg text-emerald-500 sm:pl-7">
                                        {formatCurrency(card.totalValue)}
                                    </strong>
                                </button>

                                {isExpanded && (
                                    <div className="divide-y divide-zinc-100 dark:divide-zinc-900 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 pl-11">
                                        {card.purchases.map((purchase) => (
                                            <div
                                                key={purchase.id}
                                                className="flex flex-col gap-1 py-3 pr-4 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        {purchase.description}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        {purchase.supplierName &&
                                                            `${purchase.supplierName} • `}
                                                        {new Date(
                                                            purchase.createdAt,
                                                        ).toLocaleDateString('pt-BR')}
                                                    </p>
                                                </div>

                                                <div className="text-sm sm:text-right">
                                                    <span className="font-medium">
                                                        {formatCurrency(purchase.value)}
                                                    </span>{' '}
                                                    <span
                                                        className={
                                                            purchase.hasInvoice
                                                                ? 'text-emerald-500'
                                                                : 'text-orange-400'
                                                        }
                                                    >
                                                        •{' '}
                                                        {statusLabel[purchase.status] ||
                                                            purchase.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
