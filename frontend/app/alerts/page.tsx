'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type Alert = {
    id: string;
    type: string;
    level: 'INFO' | 'WARNING' | 'CRITICAL';
    title: string;
    description: string;
    createdAt: string;
    purchase?: {
        id: string;
        description: string;
        value: string;
        store?: { name: string };
        supplier?: { name: string } | null;
        createdBy?: { name: string };
    } | null;
};

const levelLabel = {
    INFO: 'Informativo',
    WARNING: 'Atenção',
    CRITICAL: 'Crítico',
};

const levelColor = {
    INFO: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    WARNING: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    CRITICAL: 'text-red-400 bg-red-500/10 border-red-500/30',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function AlertsPage() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadAlerts() {
        try {
            setLoading(true);
            const response = await api.get('/alerts');
            setAlerts(response.data);
        } catch {
            toast.error('Erro ao carregar alertas');
        } finally {
            setLoading(false);
        }
    }

    async function resolveAlert(id: string) {
        try {
            await api.post(`/alerts/${id}/resolve`);
            toast.success('Alerta resolvido');
            await loadAlerts();
        } catch {
            toast.error('Erro ao resolver alerta');
        }
    }

    useEffect(() => {
        loadAlerts();
    }, []);

    return (
        <AppLayout title="Alertas">
            {loading ? (
                <p className="text-zinc-400">Carregando alertas...</p>
            ) : alerts.length === 0 ? (
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                    <CheckCircle2 className="mx-auto mb-3 text-green-400" />
                    <h2 className="text-xl font-bold">Nenhum alerta pendente</h2>
                    <p className="mt-2 text-zinc-400">
                        Tudo sob controle no momento.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {alerts.map((alert) => (
                        <div
                            key={alert.id}
                            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
                        >
                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <div className="mb-3 flex items-center gap-3">
                                        <div
                                            className={`rounded-2xl border p-3 ${levelColor[alert.level]
                                                }`}
                                        >
                                            <AlertTriangle size={22} />
                                        </div>

                                        <div>
                                            <h2 className="text-lg font-bold">{alert.title}</h2>
                                            <p className="text-sm text-zinc-400">
                                                {levelLabel[alert.level]} •{' '}
                                                {new Date(alert.createdAt).toLocaleString('pt-BR')}
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-zinc-300">
                                        {alert.description}
                                    </p>

                                    {alert.purchase && (
                                        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                            <p className="font-medium">
                                                {alert.purchase.description}
                                            </p>

                                            <p className="mt-1 text-sm text-zinc-400">
                                                {alert.purchase.store?.name || 'Loja não informada'}
                                                {alert.purchase.supplier?.name &&
                                                    ` • ${alert.purchase.supplier.name}`}
                                            </p>

                                            <p className="mt-2 text-lg font-bold text-green-400">
                                                {formatCurrency(alert.purchase.value)}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => resolveAlert(alert.id)}
                                    className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
                                >
                                    Marcar como resolvido
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </AppLayout>
    );
}