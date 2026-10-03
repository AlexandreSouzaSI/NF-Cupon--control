'use client';

import { useMemo, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ShoppingBag, Receipt, History, RefreshCw, Loader2 } from 'lucide-react';

import { ItemsPerDayTab } from '../../src/components/meep/ItemsPerDayTab';
import { TaxSalesTab } from '../../src/components/meep/TaxSalesTab';
import { SyncLogsTab } from '../../src/components/meep/SyncLogsTab';

// Conciliação de Caixa saiu daqui — agora mora só em /conciliacao-caixa
// (consolidada com o lançamento manual Sistema x Banco), pra não ficar
// duas telas falando de conciliação de caixa em lugares diferentes.
type TabKey = 'itens' | 'impostos' | 'sincronizacao';

const tabs: { key: TabKey; label: string; icon: typeof ShoppingBag; roles: UserRole[] }[] = [
    {
        key: 'itens',
        label: 'Itens por Dia',
        icon: ShoppingBag,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
    {
        key: 'impostos',
        label: 'Vendas e Impostos',
        icon: Receipt,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
    {
        key: 'sincronizacao',
        label: 'Histórico de Sincronização',
        icon: History,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
];

export default function MeepPage() {
    const user = getUser();
    const activeStore = getActiveStore();

    const visibleTabs = useMemo(
        () => tabs.filter((tab) => !user || tab.roles.includes(user.role)),
        [user],
    );

    const [activeTab, setActiveTab] = useState<TabKey>(
        visibleTabs[0]?.key || 'itens',
    );

    const [syncing, setSyncing] = useState(false);

    // Bump pra forçar as abas (ItemsPerDayTab/TaxSalesTab/SyncLogsTab) a
    // remontar e recarregar os dados depois de um sync manual — sem isso,
    // quem já está numa aba só veria o resultado novo trocando de aba e
    // voltando.
    const [refreshKey, setRefreshKey] = useState(0);

    async function handleSyncNow() {
        if (!activeStore) {
            toast.error('Não foi possível identificar a loja ativa.');
            return;
        }

        try {
            setSyncing(true);

            const response = await api.post(
                `/meep/${activeStore.id}/sync-now`,
            );

            const result = response.data as {
                success: boolean;
                message?: string;
            };

            if (result.success) {
                toast.success(
                    'Sincronização disparada — itens, impostos e conciliação já estão sendo buscados de novo na Meep.',
                );
                setRefreshKey((key) => key + 1);
            } else {
                toast.error(
                    result.message ||
                    'Não foi possível sincronizar com a Meep.',
                );
            }
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao sincronizar com a Meep.',
            );
        } finally {
            setSyncing(false);
        }
    }

    return (
        <AppLayout title="Vendas Meep">
            <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-bold">Vendas Meep</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Itens vendidos por dia e CFOP/NCM por venda —
                            sincronizado automaticamente da Meep (ver Cadastros →
                            Lojas pra configurar a credencial). A Conciliação de
                            Caixa agora fica em Financeiro → Conciliação de
                            Caixa.
                        </p>
                    </div>

                    <button
                        onClick={handleSyncNow}
                        disabled={syncing}
                        title="Busca de novo na Meep os pedidos, impostos e conciliação (mesma rotina do cron automático, só que agora)"
                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:cursor-wait ${syncing
                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
                            : 'border-teal-500/30 bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 dark:text-teal-400'
                            }`}
                    >
                        {syncing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        Sincronizar agora
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;

                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${isActive
                                    ? 'bg-teal-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'itens' && (
                    <ItemsPerDayTab key={`itens-${refreshKey}`} />
                )}
                {activeTab === 'impostos' && (
                    <TaxSalesTab key={`impostos-${refreshKey}`} />
                )}
                {activeTab === 'sincronizacao' && (
                    <SyncLogsTab key={`sync-${refreshKey}`} />
                )}
            </div>
        </AppLayout>
    );
}
