'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { getActiveStore, setActiveStore } from '@/lib/active-store';
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

// Mesma ordenação de módulo que vem da API, só pra comparar duas listas
// de módulos sem se importar com a ordem (evita marcar como "alterado"
// uma linha que só teve os itens reordenados).
function sameModules(a: StoreModuleKey[], b: StoreModuleKey[]) {
    if (a.length !== b.length) return false;
    const setB = new Set(b);
    return a.every((item) => setB.has(item));
}

export default function AdminModulesPage() {
    const router = useRouter();

    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(true);
    const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
    const [stores, setStores] = useState<StoreRow[]>([]);
    // Snapshot do que está salvo de verdade no banco — usado só pra saber
    // quais linhas têm alteração pendente (dirty) e pra "Descartar" voltar
    // ao estado original sem precisar recarregar a página.
    const [savedStores, setSavedStores] = useState<StoreRow[]>([]);
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

                const rows = storesRes.data.map((store: any) => ({
                    id: store.id,
                    name: store.name,
                    enabledModules: store.enabledModules || [],
                }));

                setStores(rows);
                setSavedStores(rows);
            } catch {
                toast.error('Não deu pra carregar as lojas/módulos.');
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [checking]);

    // Só mexe na tela — não salva nada sozinho. Fica pendente até a pessoa
    // clicar em "Salvar" naquela linha (evita disparar um PATCH por
    // clique e a pessoa perder o fio de quantos módulos já mudou).
    function toggleModule(storeId: string, module: StoreModuleKey) {
        setStores((prev) =>
            prev.map((item) => {
                if (item.id !== storeId) return item;

                const nextModules = item.enabledModules.includes(module)
                    ? item.enabledModules.filter((entry) => entry !== module)
                    : [...item.enabledModules, module];

                return { ...item, enabledModules: nextModules };
            }),
        );
    }

    function isDirty(store: StoreRow) {
        const saved = savedStores.find((item) => item.id === store.id);
        if (!saved) return false;
        return !sameModules(store.enabledModules, saved.enabledModules);
    }

    function discardChanges(storeId: string) {
        const saved = savedStores.find((item) => item.id === storeId);
        if (!saved) return;

        setStores((prev) =>
            prev.map((item) =>
                item.id === storeId
                    ? { ...item, enabledModules: saved.enabledModules }
                    : item,
            ),
        );
    }

    async function saveStore(store: StoreRow) {
        setSavingStoreId(store.id);

        try {
            await api.patch(`/stores/${store.id}/modules`, {
                enabledModules: store.enabledModules,
            });

            setSavedStores((prev) =>
                prev.map((item) =>
                    item.id === store.id
                        ? { ...item, enabledModules: store.enabledModules }
                        : item,
                ),
            );

            // Se a loja salva é a loja ativa da sua própria sessão, o menu
            // lateral já carregou os módulos antigos quando essa página
            // montou — atualiza o cookie com o valor novo e recarrega, senão
            // a mudança só aparece depois de trocar de tela ou dar F5 na
            // mão. Mesmo padrão do seletor de loja no topo.
            const active = getActiveStore();

            if (active && active.id === store.id) {
                setActiveStore({ ...active, enabledModules: store.enabledModules });
                toast.success(`Módulos de ${store.name} salvos. Atualizando...`);
                window.location.reload();
                return;
            }

            toast.success(`Módulos de ${store.name} salvos.`);
        } catch {
            toast.error(`Não deu pra salvar os módulos de ${store.name}.`);
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
                                {stores.map((store, index) => {
                                    const dirty = isDirty(store);
                                    const savingThis = savingStoreId === store.id;

                                    return (
                                        <tr
                                            key={store.id}
                                            className={
                                                index % 2 === 0
                                                    ? 'bg-white dark:bg-zinc-950'
                                                    : 'bg-zinc-50 dark:bg-zinc-900/40'
                                            }
                                        >
                                            <td className="sticky left-0 z-10 bg-inherit px-4 py-3 font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span>{store.name}</span>

                                                    {dirty && !savingThis && (
                                                        <span
                                                            className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                                            title="Alterações não salvas"
                                                        />
                                                    )}
                                                </div>

                                                {(dirty || savingThis) && (
                                                    <div className="mt-1 flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={savingThis}
                                                            onClick={() => saveStore(store)}
                                                            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                                                        >
                                                            {savingThis ? 'Salvando...' : 'Salvar'}
                                                        </button>

                                                        {!savingThis && (
                                                            <button
                                                                type="button"
                                                                onClick={() => discardChanges(store.id)}
                                                                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                            >
                                                                Descartar
                                                            </button>
                                                        )}
                                                    </div>
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
                                                        disabled={savingThis}
                                                        checked={store.enabledModules.includes(
                                                            module.value,
                                                        )}
                                                        onChange={() =>
                                                            toggleModule(store.id, module.value)
                                                        }
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
