'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { Briefcase, Plus, Receipt } from 'lucide-react';

import { NewServiceTab } from '../../src/components/services/NewServiceTab';
import { ServicesTab } from '../../src/components/services/ServicesTab';
import { ServiceNfTab } from '../../src/components/services/ServiceNfTab';

type TabKey = 'novo' | 'servicos' | 'relatorios';

const tabs: {
    key: TabKey;
    label: string;
    icon: typeof Briefcase;
    roles: UserRole[];
}[] = [
    {
        key: 'novo',
        label: 'Novo Serviço',
        icon: Plus,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
            'FINANCEIRO',
        ],
    },
    {
        key: 'servicos',
        label: 'Serviços',
        icon: Briefcase,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
            'FINANCEIRO',
        ],
    },
    {
        key: 'relatorios',
        label: 'Relatorios',
        icon: Receipt,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
            'FINANCEIRO',
        ],
    },
];

export default function ServicesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = getUser();

    const visibleTabs = useMemo(
        () =>
            tabs.filter((tab) => !user || tab.roles.includes(user.role)),
        [user],
    );

    const requestedTab = searchParams.get('tab') as TabKey | null;

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        if (
            requestedTab &&
            visibleTabs.some((tab) => tab.key === requestedTab)
        ) {
            return requestedTab;
        }

        return visibleTabs[0]?.key || 'servicos';
    });

    useEffect(() => {
        router.replace(`/services?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Serviços">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Serviços</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Cadastre serviços prestados e mantenha as NFs
                        organizadas por período.
                    </p>
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

                {activeTab === 'novo' && <NewServiceTab />}
                {activeTab === 'servicos' && <ServicesTab />}
                {activeTab === 'relatorios' && <ServiceNfTab />}
            </div>
        </AppLayout>
    );
}
