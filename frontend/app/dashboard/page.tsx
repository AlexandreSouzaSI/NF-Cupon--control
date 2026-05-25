'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    AlertTriangle,
    Bell,
    CheckCircle2,
    Clock,
    ReceiptText,
    ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';

type DashboardSummary = {
    totalPurchases: number;
    pendingApprovals: number;
    waitingInvoices: number;
    rejectedPurchases: number;
    approvedTotal: number;
    criticalAlerts: number;
    unreadNotifications: number;
    recentPurchases: {
        id: string;
        description: string;
        value: string;
        status: string;
        createdAt: string;
        store: { name: string };
        supplier?: { name: string } | null;
        createdBy: { name: string };
    }[];
    recentAlerts: {
        id: string;
        title: string;
        description: string;
        level: string;
        createdAt: string;
        purchase?: {
            description: string;
        } | null;
    }[];
};

function formatCurrency(value: number | string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function DashboardPage() {
    const router = useRouter();

    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);

    async function loadSummary() {
        try {
            setLoading(true);
            const response = await api.get('/dashboard/summary');
            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar dashboard');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSummary();
    }, []);

    const cards = [
        {
            title: 'Aguardando aprovação',
            value: summary?.pendingApprovals ?? 0,
            description: 'Compras precisam de decisão',
            icon: Clock,
            color: 'text-yellow-400',
            href: '/approvals',
        },
        {
            title: 'Cupons sem NF',
            value: summary?.waitingInvoices ?? 0,
            description: 'Pendências fiscais abertas',
            icon: ReceiptText,
            color: 'text-orange-400',
            href: '/fiscal-documents',
        },
        {
            title: 'Alertas críticos',
            value: summary?.criticalAlerts ?? 0,
            description: 'Riscos não resolvidos',
            icon: AlertTriangle,
            color: 'text-red-400',
            href: '/alerts',
        },
        {
            title: 'Notificações',
            value: summary?.unreadNotifications ?? 0,
            description: 'Avisos não lidos',
            icon: Bell,
            color: 'text-blue-400',
            href: '/notifications',
        },
    ];

    return (
        <AppLayout title="Dashboard">
            {loading ? (
                <p className="text-zinc-400">Carregando dashboard...</p>
            ) : (
                <>
                    <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
                        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">
                                        Valor aprovado / em andamento
                                    </p>

                                    <strong className="mt-1 block text-4xl text-green-400">
                                        {formatCurrency(summary?.approvedTotal ?? 0)}
                                    </strong>

                                    <p className="mt-2 text-sm text-zinc-500">
                                        Baseado em compras aprovadas, com cupom, NF, conferidas ou
                                        fechadas.
                                    </p>
                                </div>

                                <div className="rounded-2xl bg-green-500/10 p-4 text-green-400">
                                    <CheckCircle2 size={34} />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-zinc-400">Total de compras</p>
                                    <strong className="mt-1 block text-4xl text-blue-400">
                                        {summary?.totalPurchases ?? 0}
                                    </strong>
                                </div>

                                <div className="rounded-2xl bg-blue-500/10 p-4 text-blue-400">
                                    <ShoppingCart size={34} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {cards.map((card) => {
                            const Icon = card.icon;

                            return (
                                <button
                                    key={card.title}
                                    onClick={() => router.push(card.href)}
                                    className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-left shadow-xl hover:bg-zinc-800/60"
                                >
                                    <div className="mb-4 flex items-center justify-between">
                                        <div className={`rounded-2xl bg-zinc-950 p-3 ${card.color}`}>
                                            <Icon size={24} />
                                        </div>

                                        <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs text-zinc-400">
                                            abrir
                                        </span>
                                    </div>

                                    <p className="text-sm text-zinc-400">{card.title}</p>

                                    <strong className="mt-2 block text-3xl">{card.value}</strong>

                                    <p className="mt-2 text-sm text-zinc-500">
                                        {card.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                            <h2 className="text-lg font-bold">Últimas compras</h2>

                            <div className="mt-4 space-y-3">
                                {summary?.recentPurchases.length === 0 ? (
                                    <p className="text-sm text-zinc-400">
                                        Nenhuma compra registrada.
                                    </p>
                                ) : (
                                    summary?.recentPurchases.map((purchase) => (
                                        <button
                                            key={purchase.id}
                                            onClick={() => router.push(`/purchases/${purchase.id}`)}
                                            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium">{purchase.description}</p>

                                                    <p className="mt-1 text-sm text-zinc-400">
                                                        {purchase.store.name} • {purchase.createdBy.name}
                                                        {purchase.supplier?.name &&
                                                            ` • ${purchase.supplier.name}`}
                                                    </p>

                                                    <p className="mt-1 text-xs text-zinc-500">
                                                        {new Date(purchase.createdAt).toLocaleString(
                                                            'pt-BR',
                                                        )}
                                                    </p>
                                                </div>

                                                <strong className="text-green-400">
                                                    {formatCurrency(purchase.value)}
                                                </strong>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </section>

                        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                            <h2 className="text-lg font-bold">Alertas recentes</h2>

                            <div className="mt-4 space-y-3">
                                {summary?.recentAlerts.length === 0 ? (
                                    <p className="text-sm text-zinc-400">
                                        Nenhum alerta pendente.
                                    </p>
                                ) : (
                                    summary?.recentAlerts.map((alert) => (
                                        <button
                                            key={alert.id}
                                            onClick={() => router.push('/alerts')}
                                            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-left hover:bg-zinc-900"
                                        >
                                            <div className="flex gap-3">
                                                <AlertTriangle
                                                    size={20}
                                                    className={
                                                        alert.level === 'CRITICAL'
                                                            ? 'text-red-400'
                                                            : 'text-yellow-400'
                                                    }
                                                />

                                                <div>
                                                    <p className="font-medium">{alert.title}</p>

                                                    <p className="mt-1 text-sm text-zinc-400">
                                                        {alert.description}
                                                    </p>

                                                    {alert.purchase?.description && (
                                                        <p className="mt-1 text-xs text-zinc-500">
                                                            Compra: {alert.purchase.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                </>
            )}
        </AppLayout>
    );
}