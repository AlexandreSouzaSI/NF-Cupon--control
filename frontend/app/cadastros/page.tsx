'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { Building2, CreditCard, Truck, Users } from 'lucide-react';

import { UsersTab } from '../../src/components/cadastros/UsersTab';
import { StoresTab } from '../../src/components/cadastros/StoresTab';
import { SuppliersTab } from '../../src/components/cadastros/SuppliersTab';
import { CardsTab } from '../../src/components/cadastros/CardsTab';

type TabKey = 'usuarios' | 'lojas' | 'fornecedores' | 'cartoes';

const tabs: {
    key: TabKey;
    label: string;
    icon: typeof Users;
    roles: UserRole[];
}[] = [
    {
        key: 'usuarios',
        label: 'Usuários',
        icon: Users,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
    },
    {
        key: 'lojas',
        label: 'Lojas',
        icon: Building2,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
    },
    {
        key: 'fornecedores',
        label: 'Fornecedores',
        icon: Truck,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
    },
    {
        key: 'cartoes',
        label: 'Cartões',
        icon: CreditCard,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'],
    },
];

export default function CadastrosPage() {
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
        if (requestedTab && visibleTabs.some((tab) => tab.key === requestedTab)) {
            return requestedTab;
        }

        return visibleTabs[0]?.key || 'lojas';
    });

    useEffect(() => {
        router.replace(`/cadastros?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Cadastros">
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

                {activeTab === 'usuarios' && <UsersTab />}
                {activeTab === 'lojas' && <StoresTab />}
                {activeTab === 'fornecedores' && <SuppliersTab />}
                {activeTab === 'cartoes' && <CardsTab />}
            </div>
        </AppLayout>
    );
}
