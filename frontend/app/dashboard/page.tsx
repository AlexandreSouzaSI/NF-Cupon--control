'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Briefcase,
    ListChecks,
    PackageX,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { getUser } from '@/lib/auth';
import { canAccessHref } from '@/lib/menu';

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

type TeamTaskStat = {
    userId: string;
    userName: string;
    aFazer: number;
    emAndamento: number;
    pausada: number;
    atraso: number;
    concluidas: number;
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

    losses: {
        countMonth: number;
    };

    tasks: {
        pendingToday: number;
        team: TeamTaskStat[];
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

export default function DashboardPage() {
    const router = useRouter();
    const user = getUser();

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
            title: 'Perdas este mês',
            value: summary.losses.countMonth,
            description: 'Registros de perda no período',
            icon: PackageX,
            iconClass: 'text-red-400 bg-red-500/10',
            href: '/losses',
        },
        {
            title: 'Minhas tarefas pendentes',
            value: summary.tasks.pendingToday,
            description: 'Suas tarefas a fazer ou atrasadas até hoje',
            icon: ListChecks,
            iconClass: 'text-violet-400 bg-violet-500/10',
            href: '/tasks',
        },
        {
            title: 'NF Serviços',
            value: summary.services.nfCountMonth,
            description: 'Notas anexadas este mês',
            icon: Briefcase,
            iconClass: 'text-blue-400 bg-blue-500/10',
            href: '/services?tab=relatorios',
        },
    ];

    // Só mostra o card se o perfil logado tem acesso à página que ele
    // aponta — mesma matriz de permissões do menu lateral, pra ninguém ver
    // um atalho pra uma tela que depois não consegue abrir.
    const visibleCards = user
        ? operationalCards.filter((card) => canAccessHref(user.role, card.href))
        : operationalCards;

    return (
        <AppLayout title="Centro de Operações">
            <div className="space-y-6">
                <header>
                    <h2 className="text-2xl font-bold">
                        O que precisa ser resolvido
                    </h2>

                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Acompanhe perdas, serviços e tarefas.
                    </p>
                </header>

                <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {visibleCards.map((card) => {
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

                {summary.tasks.team.length > 0 && (
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-lg font-bold">
                                Quadro de tarefas por pessoa
                            </h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Quem está com o quê na loja ativa
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {summary.tasks.team.map((person) => (
                                <div
                                    key={person.userId}
                                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                                >
                                    <p className="font-semibold">
                                        Tarefas de {person.userName}
                                    </p>

                                    <div className="mt-3 space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                                Concluídas (mês)
                                            </span>
                                            <span className="font-semibold">
                                                {person.concluidas}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                                Em andamento
                                            </span>
                                            <span className="font-semibold">
                                                {person.emAndamento}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                                Pausada
                                            </span>
                                            <span className="font-semibold">
                                                {person.pausada}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-red-500" />
                                                Em atraso
                                            </span>
                                            <span className="font-semibold">
                                                {person.atraso}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-zinc-400" />
                                                A fazer
                                            </span>
                                            <span className="font-semibold">
                                                {person.aFazer}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </AppLayout>
    );
}