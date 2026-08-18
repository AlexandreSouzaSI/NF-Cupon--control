'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, hasGlobalStoreAccess } from '@/lib/auth';
import { ShieldAlert, Users, Wallet } from 'lucide-react';

import { EmployeesTab } from '../../src/components/cadastros/EmployeesTab';
import { EmployeePaymentsTab } from '../../src/components/employees/EmployeePaymentsTab';

type TabKey = 'funcionarios' | 'pagamentos';

const tabs: { key: TabKey; label: string; icon: typeof Users }[] = [
    { key: 'funcionarios', label: 'Funcionários', icon: Users },
    { key: 'pagamentos', label: 'Pagamentos', icon: Wallet },
];

export default function EmployeesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = getUser();
    const allowed = !!user && hasGlobalStoreAccess(user.role);

    const requestedTab = searchParams.get('tab') as TabKey | null;

    const [activeTab, setActiveTab] = useState<TabKey>(
        requestedTab && tabs.some((tab) => tab.key === requestedTab)
            ? requestedTab
            : 'funcionarios',
    );

    useEffect(() => {
        router.replace(`/employees?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Funcionários">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">RH — Funcionários</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Cadastro de funcionários e controle de pagamentos.
                        Acesso restrito a Administrativo e Proprietário.
                    </p>
                </div>

                {allowed ? (
                    <>
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                            {tabs.map((tab) => {
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

                        {activeTab === 'funcionarios' && <EmployeesTab />}
                        {activeTab === 'pagamentos' && (
                            <EmployeePaymentsTab />
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
                        <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                            <ShieldAlert size={22} />
                        </div>
                        <p className="font-semibold">Acesso restrito</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Essa página só pode ser vista pelos perfis
                            Administrativo e Proprietário.
                        </p>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
