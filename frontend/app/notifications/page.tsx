'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import {
    AlertTriangle,
    Bell,
    Briefcase,
    CheckCircle2,
    Clock,
    ListChecks,
    ReceiptText,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

type Notification = {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    createdAt: string;
};

const typeIcon: Record<string, React.ElementType> = {
    PURCHASE_CREATED: ReceiptText,
    PURCHASE_PURCHASED: CheckCircle2,
    PURCHASE_CANCELED: ShieldCheck,
    WAITING_APPROVAL: Clock,
    WAITING_INVOICE: ReceiptText,
    CRITICAL_ALERT: Bell,
    TASK_ASSIGNED: ListChecks,
    TASK_OVERDUE: AlertTriangle,
    TASK_CONFIRMED: CheckCircle2,
    LOSS_ADDED: Trash2,
    SERVICE_ADDED: Briefcase,
};

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadNotifications() {
        try {
            setLoading(true);

            const response = await api.get('/notifications');

            setNotifications(response.data);
        } catch {
            toast.error('Erro ao carregar notificações');
        } finally {
            setLoading(false);
        }
    }

    async function markAsRead(id: string) {
        try {
            await api.post(`/notifications/${id}/read`);

            toast.success('Notificação marcada como lida');

            await loadNotifications();
        } catch {
            toast.error('Erro ao marcar notificação');
        }
    }

    useEffect(() => {
        loadNotifications();
    }, []);

    const unreadCount = notifications.filter(
        (notification) => !notification.read,
    ).length;

    return (
        <AppLayout title="Notificações">
            <div className="mb-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <Bell size={24} />
                    </div>

                    <div>
                        <h2 className="text-xl font-bold">
                            Central de notificações
                        </h2>

                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {unreadCount} notificação(ões) não lida(s)
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <p className="text-zinc-600 dark:text-zinc-400">Carregando notificações...</p>
            ) : notifications.length === 0 ? (
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                    <CheckCircle2 className="mx-auto mb-3 text-green-400" />

                    <h2 className="text-xl font-bold">
                        Nenhuma notificação
                    </h2>

                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        Quando algo importante acontecer, aparecerá aqui.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {notifications.map((notification) => {
                        const Icon = typeIcon[notification.type] || Bell;

                        return (
                            <div
                                key={notification.id}
                                className={`rounded-3xl border p-5 ${notification.read
                                    ? 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                    : 'border-green-500/30 bg-green-500/10'
                                    }`}
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                    <div className="flex gap-3">
                                        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-950 p-3 text-green-400">
                                            <Icon size={22} />
                                        </div>

                                        <div>
                                            <h3 className="font-bold">
                                                {notification.title}
                                            </h3>

                                            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                                                {notification.message}
                                            </p>

                                            <p className="mt-2 text-xs text-zinc-500">
                                                {new Date(
                                                    notification.createdAt,
                                                ).toLocaleString('pt-BR')}
                                            </p>
                                        </div>
                                    </div>

                                    {!notification.read && (
                                        <button
                                            onClick={() =>
                                                markAsRead(notification.id)
                                            }
                                            className="rounded-xl border border-green-500/30 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
                                        >
                                            Marcar como lida
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </AppLayout>
    );
}