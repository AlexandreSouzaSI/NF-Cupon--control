'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { CalendarDays, ClipboardList, List, Scale } from 'lucide-react';

import { ScheduleTab } from '../../src/components/cotacao/ScheduleTab';
import { SuggestedListTab } from '../../src/components/cotacao/SuggestedListTab';
import { QuotationsTab } from '../../src/components/cotacao/QuotationsTab';
import { ListasTab } from '../../src/components/cotacao/ListasTab';

type TabKey = 'lista' | 'agenda' | 'cotacoes' | 'listas';

const tabs: { key: TabKey; label: string; icon: typeof CalendarDays; roles: UserRole[] }[] = [
    {
        key: 'lista',
        label: 'Lista sugerida',
        icon: ClipboardList,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
    },
    {
        key: 'cotacoes',
        label: 'Cotações enviadas',
        icon: Scale,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
    },
    {
        key: 'agenda',
        label: 'Agenda',
        icon: CalendarDays,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
    },
    {
        key: 'listas',
        label: 'Listas',
        icon: List,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
    },
];

export default function CotacaoPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <CotacaoPageInner />
        </Suspense>
    );
}

function CotacaoPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = getUser();

    const visibleTabs = useMemo(
        () => tabs.filter((tab) => !user || tab.roles.includes(user.role)),
        [user],
    );

    const requestedTab = searchParams.get('tab') as TabKey | null;

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        if (requestedTab && visibleTabs.some((tab) => tab.key === requestedTab)) {
            return requestedTab;
        }
        return visibleTabs[0]?.key || 'lista';
    });

    function changeTab(tab: TabKey) {
        setActiveTab(tab);
        router.replace(`/cotacao?tab=${tab}`);
    }

    return (
        <AppLayout title="Cotação">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Cotação</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Monte a lista de compra sugerida por categoria e
                        mande cotação pros fornecedores — a agenda define
                        em qual dia cada categoria costuma ser cotada.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;

                        return (
                            <button
                                key={tab.key}
                                onClick={() => changeTab(tab.key)}
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

                {activeTab === 'lista' && <SuggestedListTab />}
                {activeTab === 'cotacoes' && <QuotationsTab />}
                {activeTab === 'agenda' && <ScheduleTab />}
                {activeTab === 'listas' && <ListasTab />}
            </div>
        </AppLayout>
    );
}
