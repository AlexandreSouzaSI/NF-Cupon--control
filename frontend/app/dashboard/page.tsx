'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Briefcase,
    CheckCircle2,
    Clock3,
    FileWarning,
    PackageCheck,
    ReceiptText,
    ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

type PendingTask = {
    id: string;
    purchaseId: string;
    type: string;
    title: string;
    description: string;
    storeName: string;
    supplierName?: string | null;
    createdAt: string;
    href: string;
};

type RecentPurchase = {
    id: string;
    description: string;
    value: string;
    status: string;
    createdAt: string;
    store: {
        id: string;
        name: string;
    };
    supplier?: {
        id: string;
        name: string;
    } | null;
    createdBy: {
        id: string;
        name: string;
    };
    checkedBy?: {
        id: string;
        name: string;
    } | null;
};

type RecentAlert = {
    id: string;
    title: string;
    description: string;
    level: string;
    createdAt: string;
    purchase?: {
        id: string;
        description: string;
        store?: {
            id: string;
            name: string;
        };
    } | null;
};

type DashboardSummary = {
    operational: {
        totalPurchases: number;
        waitingApproval: number;
        waitingReceipt: number;
        receivedWithDifference: number;
        waitingInvoice: number;
        couponOnly: number;
        purchasesWithoutInvoice: number;
    };

    today: {
        created: number;
        received: number;
        closed: number;
        open: number;
    };

    financial: {
        billsDueToday: number;
        billsDueTodayTotal: number;
        billsDueWeek: number;
        billsDueWeekTotal: number;
        overdueBills: number;
        overdueBillsTotal: number;
        cardPurchasesTotal: number;
    };

    alerts: {
        critical: number;
        unreadNotifications: number;
    };

    services: {
        nfCountMonth: number;
    };

    pendingTasks: PendingTask[];
    recentPurchases: RecentPurchase[];
    recentAlerts: RecentAlert[];
};

const statusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida corretamente',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com divergência',
    WAITING_INVOICE: 'Aguardando NF',
    HAS_COUPON_ONLY: 'Apenas com cupom',
    HAS_INVOICE: 'Com NF',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

const statusColor: Record<string, string> = {
    DRAFT: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    WAITING_APPROVAL: 'bg-yellow-500/10 text-yellow-400',
    APPROVED: 'bg-blue-500/10 text-blue-400',
    REJECTED: 'bg-red-500/10 text-red-400',
    WAITING_RECEIPT: 'bg-orange-500/10 text-orange-400',
    RECEIVED_OK: 'bg-emerald-500/10 text-emerald-400',
    RECEIVED_WITH_DIFFERENCE: 'bg-red-500/10 text-red-400',
    WAITING_INVOICE: 'bg-orange-500/10 text-orange-400',
    HAS_COUPON_ONLY: 'bg-yellow-500/10 text-yellow-400',
    HAS_INVOICE: 'bg-purple-500/10 text-purple-400',
    WAITING_PAYMENT_REGISTER: 'bg-cyan-500/10 text-cyan-400',
    CLOSED: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    CANCELED: 'bg-red-500/10 text-red-400',
};

const taskColor: Record<string, string> = {
    WAITING_APPROVAL: 'text-yellow-400 bg-yellow-500/10',
    WAITING_RECEIPT: 'text-orange-400 bg-orange-500/10',
    WAITING_INVOICE: 'text-purple-400 bg-purple-500/10',
    RECEIVED_WITH_DIFFERENCE: 'text-red-400 bg-red-500/10',
};

function formatCurrency(value: number | string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value: string) {
    return new Date(value).toLocaleString('pt-BR');
}

export default function DashboardPage() {
    const router = useRouter();

    const [summary, setSummary] = useState<DashboardSummary | null>(
        null,
    );

    const [loading, setLoading] = useState(true);

    async function loadSummary() {
        try {
            setLoading(true);

            const response = await api.get('/dashboard/summary', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar dashboard.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSummary();
    }, []);

    if (loading) {
        return (
            <AppLayout title="Dashboard">
                <p className="text-zinc-600 dark:text-zinc-400">
                    Carregando centro de operações...
                </p>
            </AppLayout>
        );
    }

    if (!summary) {
        return (
            <AppLayout title="Dashboard">
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Não foi possível carregar o dashboard.
                    </p>

                    <button
                        type="button"
                        onClick={loadSummary}
                        className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-zinc-900 dark:text-white hover:bg-emerald-700"
                    >
                        Tentar novamente
                    </button>
                </div>
            </AppLayout>
        );
    }

    const operationalCards = [
        {
            title: 'Aguardando aprovação',
            value: summary.operational.waitingApproval,
            description: 'Compras que precisam de decisão',
            icon: Clock3,
            iconClass: 'text-yellow-400 bg-yellow-500/10',
            href: '/approvals',
        },
        {
            title: 'Aguardando recebimento',
            value: summary.operational.waitingReceipt,
            description: 'Mercadorias ainda não conferidas',
            icon: PackageCheck,
            iconClass: 'text-orange-400 bg-orange-500/10',
            href: '/purchases?status=WAITING_RECEIPT',
        },
        {
            title: 'Com divergência',
            value: summary.operational.receivedWithDifference,
            description: 'Itens faltando ou recebidos a mais',
            icon: AlertTriangle,
            iconClass: 'text-red-400 bg-red-500/10',
            href: '/purchases?status=RECEIVED_WITH_DIFFERENCE',
        },
        {
            title: 'Compras sem NF',
            value: summary.operational.purchasesWithoutInvoice,
            description: 'Sem nota ou apenas com cupom',
            icon: FileWarning,
            iconClass: 'text-purple-400 bg-purple-500/10',
            href: '/fiscal-documents',
        },
        {
            title: 'Boletos hoje',
            value: summary.financial.billsDueToday,
            description: formatCurrency(
                summary.financial.billsDueTodayTotal,
            ),
            icon: ReceiptText,
            iconClass: 'text-cyan-400 bg-cyan-500/10',
            href: '/bills',
        },
        {
            title: 'Boletos vencidos',
            value: summary.financial.overdueBills,
            description: formatCurrency(
                summary.financial.overdueBillsTotal,
            ),
            icon: AlertTriangle,
            iconClass: 'text-red-400 bg-red-500/10',
            href: '/bills',
        },
        {
            title: 'Alertas críticos',
            value: summary.alerts.critical,
            description: 'Precisam de conferência',
            icon: ShieldAlert,
            iconClass: 'text-red-400 bg-red-500/10',
            href: '/alerts',
        },
        {
            title: 'NF Serviços',
            value: summary.services.nfCountMonth,
            description: 'Notas anexadas este mês',
            icon: Briefcase,
            iconClass: 'text-blue-400 bg-blue-500/10',
            href: '/services?tab=nf',
        },
    ];

    return (
        <AppLayout title="Centro de Operações">
            <div className="space-y-6">
                <header>
                    <h2 className="text-2xl font-bold">
                        O que precisa ser resolvido
                    </h2>

                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Acompanhe compras, recebimentos, documentos
                        fiscais e pagamentos.
                    </p>
                </header>

                <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {operationalCards.map((card) => {
                        const Icon = card.icon;

                        return (
                            <button
                                type="button"
                                key={card.title}
                                onClick={() =>
                                    router.push(card.href)
                                }
                                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70"
                            >
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div
                                        className={`rounded-2xl p-3 ${card.iconClass}`}
                                    >
                                        <Icon size={22} />
                                    </div>

                                    <span className="rounded-full bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1 text-xs text-zinc-500">
                                        abrir
                                    </span>
                                </div>

                                <strong className="block text-3xl">
                                    {card.value}
                                </strong>

                                <p className="mt-2 font-medium">
                                    {card.title}
                                </p>

                                <p className="mt-1 text-sm text-zinc-500">
                                    {card.description}
                                </p>
                            </button>
                        );
                    })}
                </section>


                <section>
                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <div className="mb-5 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold">
                                    Minhas pendências
                                </h3>

                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Ações mais antigas que precisam
                                    avançar
                                </p>
                            </div>

                            <Clock3 className="text-yellow-400" />
                        </div>

                        {summary.pendingTasks.length === 0 ? (
                            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                                <div className="flex items-center gap-3">
                                    <CheckCircle2 className="text-emerald-400" />

                                    <div>
                                        <strong className="text-emerald-300">
                                            Nenhuma pendência urgente
                                        </strong>

                                        <p className="text-sm text-emerald-400/70">
                                            O fluxo está em dia.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {summary.pendingTasks.map((task) => (
                                    <button
                                        type="button"
                                        key={task.id}
                                        onClick={() =>
                                            router.push(task.href)
                                        }
                                        className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-left hover:bg-zinc-100 dark:hover:bg-zinc-900 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div className="flex gap-3">
                                            <div
                                                className={`mt-0.5 h-fit rounded-xl p-2 ${taskColor[
                                                    task.type
                                                    ] ||
                                                    'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                                                    }`}
                                            >
                                                <AlertTriangle
                                                    size={18}
                                                />
                                            </div>

                                            <div>
                                                <p className="font-semibold">
                                                    {task.title}
                                                </p>

                                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                                    {
                                                        task.description
                                                    }
                                                </p>

                                                <p className="mt-1 text-xs text-zinc-500">
                                                    {task.storeName}
                                                    {task.supplierName
                                                        ? ` • ${task.supplierName}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="text-left md:text-right">
                                            <p className="text-xs text-zinc-500">
                                                {formatDate(
                                                    task.createdAt,
                                                )}
                                            </p>

                                            <span className="mt-2 inline-flex rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300">
                                                resolver
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}