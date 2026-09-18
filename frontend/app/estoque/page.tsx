'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { Boxes, ArrowLeftRight, FileStack, Upload, ShoppingCart } from 'lucide-react';

import { ItemsTab } from '../../src/components/estoque/ItemsTab';
import { MovementsTab } from '../../src/components/estoque/MovementsTab';
import { LinkNfTab } from '../../src/components/estoque/LinkNfTab';
import { ImportEstoqueTab } from '../../src/components/estoque/ImportEstoqueTab';
import { ShoppingListTab } from '../../src/components/estoque/ShoppingListTab';

type TabKey = 'itens' | 'movimentar' | 'nf' | 'importar' | 'lista-compra';

const tabs: { key: TabKey; label: string; icon: typeof Boxes; roles: UserRole[] }[] = [
    {
        key: 'itens',
        label: 'Itens',
        icon: Boxes,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'ESTOQUISTA'],
    },
    {
        key: 'movimentar',
        label: 'Movimentar',
        icon: ArrowLeftRight,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'ESTOQUISTA'],
    },
    {
        key: 'nf',
        label: 'Vincular NF',
        icon: FileStack,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'ESTOQUISTA'],
    },
    {
        key: 'importar',
        label: 'Importar planilha',
        icon: Upload,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'ESTOQUISTA'],
    },
    {
        key: 'lista-compra',
        label: 'Lista de Compra',
        icon: ShoppingCart,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'ESTOQUISTA'],
    },
];

export default function EstoquePage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <EstoquePageInner />
        </Suspense>
    );
}

function EstoquePageInner() {
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
        return visibleTabs[0]?.key || 'itens';
    });

    // Sobe sempre que algo muda o saldo (lançamento manual, vínculo de
    // NF, importação de planilha) — força a aba Itens a recarregar sem
    // precisar trocar de aba.
    const [refreshKey, setRefreshKey] = useState(0);
    const bump = () => setRefreshKey((k) => k + 1);

    function changeTab(tab: TabKey) {
        setActiveTab(tab);
        router.replace(`/estoque?tab=${tab}`);
    }

    return (
        <AppLayout title="Estoque">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Estoque</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Matéria-prima e produtos de revenda — entrada por NF aceita,
                        lançamento manual ou planilha; a baixa acontece sozinha a cada
                        nova importação de vendas na aba Produtos (só pra itens
                        vinculados a um ingrediente da ficha técnica).
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
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'itens' && <ItemsTab refreshKey={refreshKey} />}
                {activeTab === 'movimentar' && <MovementsTab onChanged={bump} />}
                {activeTab === 'nf' && <LinkNfTab onChanged={bump} />}
                {activeTab === 'importar' && <ImportEstoqueTab onImported={bump} />}
                {activeTab === 'lista-compra' && <ShoppingListTab refreshKey={refreshKey} />}
            </div>
        </AppLayout>
    );
}
