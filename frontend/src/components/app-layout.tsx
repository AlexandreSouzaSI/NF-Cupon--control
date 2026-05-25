'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

import {
    BarChart3,
    CreditCard,
    FileText,
    Home,
    LogOut,
    Menu,
    Receipt,
    ShieldCheck,
    X,
    Truck,
    Building2,
    AlertTriangle,
    Bell,
    Settings,
} from 'lucide-react';

import { getToken, getUser, logout, type AuthUser } from '@/lib/auth';

const menuItems = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icon: Home,
    },
    {
        label: 'Requisição de Compra',
        href: '/purchases',
        icon: CreditCard,
    },
    {
        label: 'Compras em Análise',
        href: '/approvals',
        icon: ShieldCheck,
        badgeKey: 'approvals',
    },
    {
        label: 'Cupons/NF',
        href: '/fiscal-documents',
        icon: Receipt,
    },
    {
        label: 'Compras',
        href: '/purchase-management',
        icon: CreditCard,
    },
    {
        label: 'Relatório Fornecedores',
        href: '/reports',
        icon: BarChart3,
    },
    {
        label: 'Relatório Lojas',
        href: '/reports/stores',
        icon: Building2,
    },
    {
        label: 'Relatório Cartões',
        href: '/reports/cards',
        icon: CreditCard,
    },
    {
        label: 'Alertas',
        href: '/alerts',
        icon: AlertTriangle,
        badgeKey: 'alerts',
    },
    {
        label: 'Notificações',
        href: '/notifications',
        icon: Bell,
        badgeKey: 'notifications',
    },
    {
        label: 'Cadastros',
        href: '/registrations',
        icon: Settings,
    },
];

function getVisibleMenuItems(role: string) {
    switch (role) {
        case 'BUYER':
            return menuItems.filter((item) =>
                [
                    '/dashboard',
                    '/purchases',
                    '/notifications',
                ].includes(item.href),
            );

        case 'APPROVER':
            return menuItems.filter((item) =>
                [
                    '/dashboard',
                    '/approvals',
                    '/purchases',
                    '/notifications',
                ].includes(item.href),
            );

        case 'FINANCE':
            return menuItems.filter((item) =>
                [
                    '/dashboard',
                    '/purchases',
                    '/fiscal-documents',
                    '/reports',
                    '/notifications',
                ].includes(item.href),
            );

        default:
            return menuItems;
    }
}

export const metadata = {
    title: 'Controle de Compras',
    description: 'Controle de compras, aprovações, cupons e notas fiscais',
    manifest: '/manifest.json',
    themeColor: '#22c55e',
};

type AppLayoutProps = {
    children: React.ReactNode;
    title: string;
};

export function AppLayout({ children, title }: AppLayoutProps) {
    const router = useRouter();

    const [user, setUser] = useState<AuthUser | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [badgeCounts, setBadgeCounts] = useState({
        approvals: 0,
        alerts: 0,
        notifications: 0,
    });

    async function loadBadges() {
        try {
            const response = await api.get('/dashboard/badges');

            setBadgeCounts({
                approvals: response.data.approvals,
                alerts: response.data.alerts,
                notifications: response.data.notifications,
            });
        } catch {
            // não quebra layout
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
        loadBadges();
    }, [router]);

    function handleLogout() {
        logout();
        router.push('/');
    }

    if (!user) {
        return null;
    }

    const visibleMenuItems = getVisibleMenuItems(user.role);

    return (
        <main className="min-h-screen bg-zinc-950 text-white">
            <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 px-4 py-4 backdrop-blur">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setMenuOpen(true)}
                        className="rounded-xl border border-zinc-800 p-2 md:hidden"
                    >
                        <Menu size={22} />
                    </button>

                    <div>
                        <h1 className="text-xl font-bold">{title}</h1>
                        <p className="text-sm text-zinc-400">
                            {user.name} • {user.role}
                        </p>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="rounded-xl border border-zinc-800 p-2 text-zinc-300 hover:bg-zinc-900"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </header>

            <div className="flex">
                <aside className="hidden min-h-[calc(100vh-73px)] w-72 border-r border-zinc-800 bg-zinc-950 p-4 md:block">
                    <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        <div className="mb-2 flex items-center gap-2">
                            <FileText size={18} className="text-green-400" />
                            <strong>Controle NF</strong>
                        </div>

                        <p className="text-sm text-zinc-400">
                            Compras, cupons, notas e aprovações.
                        </p>
                    </div>

                    <nav className="space-y-2">
                        {visibleMenuItems.map((item) => {
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.href}
                                    onClick={() => router.push(item.href)}
                                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                >
                                    <Icon size={20} />
                                    <span className="flex-1">{item.label}</span>

                                    {item.badgeKey &&
                                        badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 0 && (
                                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                                {badgeCounts[item.badgeKey as keyof typeof badgeCounts]}
                                            </span>
                                        )}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {menuOpen && (
                    <div className="fixed inset-0 z-50 bg-black/70 md:hidden">
                        <aside className="h-full w-80 max-w-[85%] border-r border-zinc-800 bg-zinc-950 p-4">
                            <div className="mb-6 flex items-center justify-between">
                                <strong>Menu</strong>

                                <button
                                    onClick={() => setMenuOpen(false)}
                                    className="rounded-xl border border-zinc-800 p-2"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <nav className="space-y-2">
                                {visibleMenuItems.map((item) => {
                                    const Icon = item.icon;

                                    return (
                                        <button
                                            key={item.href}
                                            onClick={() => {
                                                setMenuOpen(false);
                                                router.push(item.href);
                                            }}
                                            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-zinc-300 hover:bg-zinc-900 hover:text-white"
                                        >
                                            <Icon size={20} />
                                            <span className="flex-1">{item.label}</span>

                                            {item.badgeKey &&
                                                badgeCounts[item.badgeKey as keyof typeof badgeCounts] > 0 && (
                                                    <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                                                        {badgeCounts[item.badgeKey as keyof typeof badgeCounts]}
                                                    </span>
                                                )}
                                        </button>
                                    );
                                })}
                            </nav>
                        </aside>
                    </div>
                )}

                <section className="w-full p-4 md:p-6">{children}</section>
            </div>
        </main>
    );
}