'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { Building2, CreditCard, Truck } from 'lucide-react';

import { SuppliersReportTab } from '../../src/components/reports/SuppliersReportTab';
import { StoresReportTab } from '../../src/components/reports/StoresReportTab';
import { CardsReportTab } from '../../src/components/reports/CardsReportTab';

type TabKey = 'fornecedores' | 'lojas' | 'cartoes';

const REPORT_ROLES: UserRole[] = [
    'ADMINISTRATIVO',
    'PROPRIETARIO',
    'GERENTE',
    'FINANCEIRO',
];

const tabs: {
    key: TabKey;
    label: string;
    icon: typeof Truck;
    roles: UserRole[];
}[] = [
    {
        key: 'fornecedores',
        label: 'Fornecedores',
        icon: Truck,
        roles: REPORT_ROLES,
    },
    {
        key: 'lojas',
        label: 'Lojas',
        icon: Building2,
        roles: REPORT_ROLES,
    },
    {
        key: 'cartoes',
        label: 'Cartões',
        icon: CreditCard,
        roles: REPORT_ROLES,
    },
];

export default function ReportsPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <ReportsPageInner />
        </Suspense>
    );
}

function ReportsPageInner() {
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

        return visibleTabs[0]?.key || 'fornecedores';
    });

    useEffect(() => {
        router.replace(`/reports?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Relatórios">
            <div className="space-y-5">
                <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;

                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${isActive
                                    ? 'bg-emerald-600 text-zinc-900 dark:text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'fornecedores' && <SuppliersReportTab />}
                {activeTab === 'lojas' && <StoresReportTab />}
                {activeTab === 'cartoes' && <CardsReportTab />}
            </div>
        </AppLayout>
    );
}
