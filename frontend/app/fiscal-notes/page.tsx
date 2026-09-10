'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { ArrowDownToLine, ArrowUpFromLine, RotateCcw } from 'lucide-react';

import { EntradaNfTab } from '../../src/components/fiscal-notes/EntradaNfTab';
import { SaidaNfTab } from '../../src/components/fiscal-notes/SaidaNfTab';
import { DevolucaoTab } from '../../src/components/fiscal-notes/DevolucaoTab';

type TabKey = 'entrada' | 'saida' | 'devolucao';

const tabs: {
    key: TabKey;
    label: string;
    icon: typeof ArrowDownToLine;
    roles: UserRole[];
}[] = [
    {
        key: 'entrada',
        label: 'Notas Fiscais de Entrada',
        icon: ArrowDownToLine,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
        ],
    },
    {
        key: 'saida',
        label: 'Notas Fiscais de Saída',
        icon: ArrowUpFromLine,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'FINANCEIRO',
        ],
    },
    {
        key: 'devolucao',
        label: 'Devolução',
        icon: RotateCcw,
        roles: [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
        ],
    },
];

export default function FiscalNotesPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <FiscalNotesPageInner />
        </Suspense>
    );
}

function FiscalNotesPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = getUser();

    const visibleTabs = useMemo(
        () => tabs.filter((tab) => !user || tab.roles.includes(user.role)),
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

        return visibleTabs[0]?.key || 'entrada';
    });

    useEffect(() => {
        router.replace(`/fiscal-notes?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Notas Fiscais">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Notas Fiscais</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Entrada (compras com fornecedores) e saída (vendas)
                        — busca automática, conciliação e importação de XML
                        em massa.
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
                                    ? 'bg-purple-600 text-zinc-900 dark:text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'entrada' && <EntradaNfTab />}
                {activeTab === 'saida' && <SaidaNfTab />}
                {activeTab === 'devolucao' && <DevolucaoTab />}
            </div>
        </AppLayout>
    );
}
