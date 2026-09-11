'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import type { StoreModuleKey } from '@/lib/menu';

type ModuleCatalogItem = {
    value: StoreModuleKey;
    label: string;
};

type StoreRow = {
    id: string;
    name: string;
    enabledModules: StoreModuleKey[];
};

export default function AdminModulesPage() {
    const router = useRouter();

    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(true);
    const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
    const [stores, setStores] = useState<StoreRow[]>([]);
    const [savingStoreId, setSavingStoreId] = useState<string | null>(null);

    // Só você (isAdminMaster) chega aqui — nem Proprietário do cliente vê
    // essa tela. Checagem de verdade é sempre no backend (AdminMasterGuard);
    // isso aqui só evita a tela piscar pra quem não devia nem tentar abrir.
    useEffect(() => {
        const user = getUser();

        if (!user?.isAdminMaster) {
            router.replace('/home');
            return;
        }

        setChecking(false);
    }, [router]);

    useEffect(() => {
        if (checking) return;

        async function load() {
            try {
                setLoading(true);

                const [catalogRes, storesRes] = await Promise.all([
                    api.get('/stores/admin/modules-catalog'),
                    api.get('/stores'),
                ]);

                setCatalog(catalogRes.data);
                setStores(
                    storesRes.data.map((store: any) => ({
                        id: store.id,
                        name: store.name,
                        enabledModules: store.enabledModules || [],
                    })),
                );
            } catch {
                toast.error('Não deu pra carregar as lojas/módulos.');
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [checking]);

    async function toggleModule(store: StoreRow, module: StoreModuleKey) {
        const nextModules = store.enabledModules.includes(module)
            ? store.enabledModules.filter((item) => item !== module)
            : [...store.enabledModules, module];

        // Otimista: atualiza a tela na hora, desfaz se o backend recusar.
        setStores((prev) =>
            prev.map((item) =>
                item.id === store.id
                    ? { ...item, enabledModules: nextModules }
                    : item,
            ),
        );

        setSavingStoreId(store.id);

        try {
            await api.patch(`/stores/${store.id}/modules`, {
                enabledModules: nextModules,
            });
        } catch {
            toast.error(`Não deu pra salvar os módulos de ${store.name}.`);

            setStores((prev) =>
                prev.map((item) =>
                    item.id === store.id
                        ? { ...item, enabledModules: store.enabledModules }
                        : item,
                ),
            );
        } finally {
            setSavingStoreId(null);
        }
    }

    if (checking) {
        return null;
    }

    return (
        <AppLayout title="Módulos por loja">
            <div className="space-y-6">
                <header className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                        <ShieldCheck size={20} />
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold">Módulos por loja</h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Escolha o que cada empresa enxerga no menu. Some da
                            tela na hora pra quem usa aquela loja — não apaga
                            nada, só esconde.
                        </p>
                    </div>
                </header>

                {loading ? (
                    <p className="text-sm text-zinc-500">Carregando...</p>
                ) : stores.length === 0 ? (
                    <p className="text-sm text-zinc-500">Nenhuma loja cadastrada.</p>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                            <thead>
                                <tr className="bg-zinc-100 dark:bg-zinc-900">
                                    <th className="sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-900 px-4 py-3 text-left font-semibold">
                                        Loja
                                    </th>

                                    {catalog.map((module) => (
                                        <th
                                            key={module.value}
                                            className="px-3 py-3 text-center font-semibold whitespace-nowrap"
                                        >
                                            {module.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>

                            <tbody>
                                {stores.map((store, index) => (
                                    <tr
                                        key={store.id}
                                        className={
                                            index % 2 === 0
                                                ? 'bg-white dark:bg-zinc-950'
                                                : 'bg-zinc-50 dark:bg-zinc-900/40'
                                        }
                                    >
                                        <td className="sticky left-0 z-10 bg-inherit px-4 py-3 font-medium">
                                            {store.name}

                                            {savingStoreId === store.id && (
                                                <span className="ml-2 text-xs text-zinc-500">
                                                    salvando...
                                                </span>
                                            )}
                                        </td>

                                        {catalog.map((module) => (
                                            <td
                                                key={module.value}
                                                className="px-3 py-3 text-center"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 accent-emerald-500"
                                                    checked={store.enabledModules.includes(
                                                        module.value,
                                                    )}
                                                    onChange={() =>
                                                        toggleModule(store, module.value)
                                                    }
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
