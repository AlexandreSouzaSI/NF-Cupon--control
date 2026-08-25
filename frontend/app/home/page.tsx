'use client';

import { useRouter } from 'next/navigation';

import { AppLayout } from '../../src/components/app-layout';
import { getUser } from '@/lib/auth';
import { menu } from '@/lib/menu';

export default function HomePage() {
    const router = useRouter();
    const user = getUser();

    // Mesma lista/ícones/permissão do menu lateral, só que em quadrados
    // grandes pra abrir com um toque — tipo um app. Já filtra sozinho pra
    // mostrar só o que o perfil logado pode acessar.
    const items = user
        ? menu
            .flatMap((group) => group.items)
            .filter((item) => item.href !== '/home' && item.roles.includes(user.role))
        : [];

    return (
        <AppLayout title="Início">
            <div className="space-y-6">
                <header>
                    <h2 className="text-2xl font-bold">Início</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        Toque num quadrado pra abrir direto a tela.
                    </p>
                </header>

                {items.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma tela liberada pro seu perfil ainda.
                    </p>
                ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                        {items.map((item) => {
                            const Icon = item.icon;

                            return (
                                <button
                                    type="button"
                                    key={item.href}
                                    onClick={() => router.push(item.href)}
                                    className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center transition hover:border-emerald-500/50 hover:bg-emerald-500/5"
                                >
                                    <div className="rounded-2xl bg-emerald-500/10 p-4 text-emerald-500">
                                        <Icon size={28} />
                                    </div>
                                    <span className="text-sm font-medium leading-tight">
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
