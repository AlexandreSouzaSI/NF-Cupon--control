'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { Upload, Package, LayoutDashboard, ShoppingCart, Factory, ChefHat } from 'lucide-react';

import { ImportProductSalesTab } from '../../src/components/product-sales/ImportProductSalesTab';
import { ProductsTab } from '../../src/components/product-sales/ProductsTab';
import { DashboardTab } from '../../src/components/product-sales/DashboardTab';
import { ShoppingListTab } from '../../src/components/product-sales/ShoppingListTab';
import { PeriodFilter } from '../../src/components/product-sales/PeriodFilter';
import { ProductionTab } from '../../src/components/product-sales/ProductionTab';
import { FichaTecnicaTab } from '../../src/components/product-sales/FichaTecnicaTab';

type TabKey =
    | 'dashboard'
    | 'importar'
    | 'produtos'
    | 'fichas-tecnicas'
    | 'producao'
    | 'compras';

const tabs: {
    key: TabKey;
    label: string;
    icon: typeof Upload;
    roles: UserRole[];
}[] = [
        {
            key: 'dashboard',
            label: 'Dashboard',
            icon: LayoutDashboard,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
        {
            key: 'produtos',
            label: 'Produtos',
            icon: Package,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
        {
            key: 'fichas-tecnicas',
            label: 'Ficha Técnica',
            icon: ChefHat,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
        {
            key: 'producao',
            label: 'Produção',
            icon: Factory,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
        {
            key: 'compras',
            label: 'Lista de Compra',
            icon: ShoppingCart,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
        {
            key: 'importar',
            label: 'Importar',
            icon: Upload,
            roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR', 'FINANCEIRO'],
        },
    ];

export default function ProductsPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <ProductsPageInner />
        </Suspense>
    );
}

function ProductsPageInner() {
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

        return visibleTabs[0]?.key || 'dashboard';
    });

    // Sobe toda vez que uma importação nova acontece — força a aba
    // "Produtos" a recarregar o resumo sem precisar trocar de aba.
    const [refreshKey, setRefreshKey] = useState(0);

    // null = "Tudo" (soma todas as importações). Compartilhado entre as 3
    // abas de análise, já que os dados vêm da mesma planilha recorrente.
    const [importId, setImportId] = useState<string | null>(null);

    const mostrarFiltroPeriodo =
        activeTab === 'dashboard' ||
        activeTab === 'produtos';

    useEffect(() => {
        router.replace(`/products?tab=${activeTab}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    return (
        <AppLayout title="Venda/Lista">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Venda/Lista</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Importe a planilha de vendas do PDV e acompanhe
                        quantidade vendida e faturamento por produto.
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
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

                    {mostrarFiltroPeriodo && (
                        <PeriodFilter
                            value={importId}
                            onChange={setImportId}
                            refreshKey={refreshKey}
                        />
                    )}
                </div>

                {activeTab === 'dashboard' && (
                    <DashboardTab refreshKey={refreshKey} importId={importId} />
                )}
                {activeTab === 'produtos' && (
                    <ProductsTab refreshKey={refreshKey} importId={importId} />
                )}
                {activeTab === 'fichas-tecnicas' && (
                    <FichaTecnicaTab refreshKey={refreshKey} />
                )}
                {activeTab === 'producao' && <ProductionTab refreshKey={refreshKey} />}
                {activeTab === 'compras' && <ShoppingListTab />}
                {activeTab === 'importar' && (
                    <ImportProductSalesTab
                        onImported={() => {
                            setRefreshKey((k) => k + 1);
                            setImportId(null);
                        }}
                    />
                )}
            </div>
        </AppLayout>
    );
}
