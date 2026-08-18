'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    Building2,
    ChevronDown,
    FileText,
    LogOut,
    Menu,
    Moon,
    Sun,
    X,
} from 'lucide-react';

import { api } from '@/lib/api';
import { getToken, getUser, logout, roleLabels, type AuthUser } from '@/lib/auth';
import {
    getActiveStore,
    setActiveStore,
    type ActiveStore,
} from '@/lib/active-store';
import { getTheme, toggleTheme, type Theme } from '@/lib/theme';
import { menu } from '@/lib/menu';

type AppLayoutProps = {
    children: React.ReactNode;
    title: string;
};

type StoreOption = {
    id: string;
    name: string;
};

type StoreStatus = 'loading' | 'needs-selection' | 'ready' | 'error';

export function AppLayout({ children, title }: AppLayoutProps) {
    const router = useRouter();

    const [user, setUser] = useState<AuthUser | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [badgeCounts, setBadgeCounts] = useState({
        approvals: 0,
        alerts: 0,
        notifications: 0,
    });

    const [storeStatus, setStoreStatus] = useState<StoreStatus>('loading');
    const [availableStores, setAvailableStores] = useState<StoreOption[]>([]);
    const [activeStore, setActiveStoreState] = useState<ActiveStore | null>(null);
    const [storeSwitcherOpen, setStoreSwitcherOpen] = useState(false);

    const [theme, setThemeState] = useState<Theme>('dark');

    function handleToggleTheme() {
        setThemeState(toggleTheme());
    }

    async function loadBadges(storeId?: string) {
        try {
            const response = await api.get('/dashboard/badges', {
                params: {
                    storeId: storeId || undefined,
                },
            });

            setBadgeCounts({
                approvals: response.data.approvals || 0,
                alerts: response.data.alerts || 0,
                notifications: response.data.notifications || 0,
            });
        } catch {
            // não quebra layout
        }
    }

    async function resolveActiveStore() {
        try {
            const response = await api.get('/stores');
            const stores: StoreOption[] = response.data.map((store: any) => ({
                id: store.id,
                name: store.name,
            }));

            setAvailableStores(stores);

            if (stores.length === 0) {
                setStoreStatus('error');
                return;
            }

            if (stores.length === 1) {
                setActiveStore(stores[0]);
                setActiveStoreState(stores[0]);
                setStoreStatus('ready');
                return;
            }

            const savedStore = getActiveStore();
            const stillValid =
                savedStore && stores.some((store) => store.id === savedStore.id);

            if (stillValid) {
                setActiveStoreState(savedStore);
                setStoreStatus('ready');
            } else {
                setStoreStatus('needs-selection');
            }
        } catch {
            setStoreStatus('error');
        }
    }

    useEffect(() => {
        const token = getToken();
        const currentUser = getUser();

        if (!token || !currentUser) {
            router.push('/');
            return;
        }

        setUser(currentUser);
        setThemeState(getTheme());
        resolveActiveStore();
    }, [router]);

    useEffect(() => {
        if (storeStatus === 'ready' && activeStore) {
            loadBadges(activeStore.id);
        }
    }, [storeStatus, activeStore]);

    function handleLogout() {
        logout();
        router.push('/');
    }

    function handleSelectStore(store: StoreOption) {
        setActiveStore(store);
        setActiveStoreState(store);
        setStoreStatus('ready');
        setStoreSwitcherOpen(false);
        // Recarrega a página pra garantir que toda tela em uso já busque
        // os dados considerando a nova loja ativa.
        window.location.reload();
    }

    if (!user) {
        return null;
    }

    if (storeStatus === 'loading') {
        return (
            <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando lojas...</p>
            </main>
        );
    }

    if (storeStatus === 'error') {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-zinc-950 px-4 text-center text-zinc-900 dark:text-white">
                <Building2 size={40} className="text-zinc-600" />
                <div>
                    <h1 className="text-lg font-bold">
                        Nenhuma loja disponível
                    </h1>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Seu usuário não está vinculado a nenhuma loja. Fale com
                        um Administrativo ou Proprietário.
                    </p>
                </div>
                <button
                    onClick={handleLogout}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                    Sair
                </button>
            </main>
        );
    }

    if (storeStatus === 'needs-selection') {
        return (
            <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 text-zinc-900 dark:text-white">
                <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8">
                    <div className="mb-6 text-center">
                        <Building2 className="mx-auto mb-3 text-emerald-400" size={32} />
                        <h1 className="text-xl font-bold">Selecione a loja</h1>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Você está vinculado a mais de uma loja. Escolha em
                            qual vai trabalhar agora — dá pra trocar depois no
                            menu superior.
                        </p>
                    </div>

                    <div className="space-y-2">
                        {availableStores.map((store) => (
                            <button
                                key={store.id}
                                onClick={() => handleSelectStore(store)}
                                className="flex w-full items-center justify-between rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-3 text-left hover:border-emerald-500"
                            >
                                <span className="font-medium">{store.name}</span>
                                <ChevronDown size={18} className="-rotate-90 text-zinc-500" />
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleLogout}
                        className="mt-6 w-full text-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                        Sair
                    </button>
                </div>
            </main>
        );
    }

    const visibleMenuGroups = menu
        .map((group) => ({
            ...group,
            items: group.items.filter((item) =>
                item.roles.includes(user.role),
            ),
        }))
        .filter((group) => group.items.length > 0);

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white">
            <header className="sticky top-0 z-30 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 px-4 py-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                    <button
                        onClick={() => setMenuOpen(true)}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 md:hidden"
                    >
                        <Menu size={22} />
                    </button>

                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-bold">{title}</h1>
                        <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                            {user.name} • {roleLabels[user.role]}
                        </p>
                    </div>

                    <div className="relative">
                        <button
                            onClick={() =>
                                availableStores.length > 1 &&
                                setStoreSwitcherOpen((open) => !open)
                            }
                            className={`flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 ${availableStores.length > 1
                                    ? 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
                                    : 'cursor-default'
                                }`}
                        >
                            <Building2 size={16} className="text-emerald-400" />
                            <span className="hidden max-w-[140px] truncate sm:inline">
                                {activeStore?.name}
                            </span>
                            {availableStores.length > 1 && (
                                <ChevronDown size={14} className="text-zinc-500" />
                            )}
                        </button>

                        {storeSwitcherOpen && availableStores.length > 1 && (
                            <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-2 shadow-2xl">
                                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    Trocar de loja
                                </p>

                                {availableStores.map((store) => (
                                    <button
                                        key={store.id}
                                        onClick={() => handleSelectStore(store)}
                                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${store.id === activeStore?.id
                                                ? 'text-emerald-400'
                                                : 'text-zinc-700 dark:text-zinc-300'
                                            }`}
                                    >
                                        {store.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleToggleTheme}
                        title={
                            theme === 'dark'
                                ? 'Mudar para tema claro'
                                : 'Mudar para tema escuro'
                        }
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                        {theme === 'dark' ? (
                            <Sun size={20} />
                        ) : (
                            <Moon size={20} />
                        )}
                    </button>

                    <button
                        onClick={handleLogout}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <div className="flex">
                <aside className="hidden min-h-[calc(100vh-73px)] w-72 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 md:block">
                    <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <FileText size={18} className="text-emerald-400" />
                            <strong>NuGalho HUB</strong>
                        </div>

                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {user.name}
                        </p>

                        <p className="text-xs text-zinc-500">
                            {roleLabels[user.role]}
                        </p>

                        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
                            <Building2 size={12} />
                            {activeStore?.name}
                        </p>
                    </div>

                    <nav className="space-y-5">
                        {visibleMenuGroups.map((group) => (
                            <div key={group.group}>
                                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                    {group.group}
                                </p>

                                <div className="space-y-1">
                                    {group.items.map((item) => {
                                        const Icon = item.icon;
                                        const badgeValue = item.badgeKey
                                            ? badgeCounts[item.badgeKey as keyof typeof badgeCounts]
                                            : 0;

                                        return (
                                            <button
                                                key={item.href}
                                                onClick={() => router.push(item.href)}
                                                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white"
                                            >
                                                <Icon size={20} />
                                                <span className="flex-1">
                                                    {item.label}
                                                </span>

                                                {item.badgeKey && badgeValue > 0 && (
                                                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-zinc-900 dark:text-white">
                                                        {badgeValue}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </aside>

                {menuOpen && (
                    <div className="fixed inset-0 z-50 bg-black/70 md:hidden">
                        <aside className="h-full w-80 max-w-[85%] overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                            <div className="mb-6 flex items-center justify-between">
                                <strong>Menu</strong>

                                <button
                                    onClick={() => setMenuOpen(false)}
                                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {availableStores.length > 1 && (
                                <div className="mb-6">
                                    <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                        Loja ativa
                                    </p>

                                    <div className="space-y-1">
                                        {availableStores.map((store) => (
                                            <button
                                                key={store.id}
                                                onClick={() => handleSelectStore(store)}
                                                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm ${store.id === activeStore?.id
                                                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                                                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                    }`}
                                            >
                                                <Building2 size={16} />
                                                {store.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <nav className="space-y-5">
                                {visibleMenuGroups.map((group) => (
                                    <div key={group.group}>
                                        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                            {group.group}
                                        </p>

                                        <div className="space-y-1">
                                            {group.items.map((item) => {
                                                const Icon = item.icon;
                                                const badgeValue = item.badgeKey
                                                    ? badgeCounts[item.badgeKey as keyof typeof badgeCounts]
                                                    : 0;

                                                return (
                                                    <button
                                                        key={item.href}
                                                        onClick={() => {
                                                            setMenuOpen(false);
                                                            router.push(item.href);
                                                        }}
                                                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-white"
                                                    >
                                                        <Icon size={20} />
                                                        <span className="flex-1">
                                                            {item.label}
                                                        </span>

                                                        {item.badgeKey && badgeValue > 0 && (
                                                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-zinc-900 dark:text-white">
                                                                {badgeValue}
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </nav>
                        </aside>
                    </div>
                )}

                <section className="w-full p-4 md:p-6">
                    {children}
                </section>
            </div>
        </main>
    );
}
