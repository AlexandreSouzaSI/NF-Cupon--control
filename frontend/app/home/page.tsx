'use client';

import { useRouter } from 'next/navigation';

import { AppLayout } from '../../src/components/app-layout';
import { getUser } from '@/lib/auth';
import { menu, menuColorStyles } from '@/lib/menu';

export default function HomePage() {
    const router = useRouter();
    const user = getUser();

    // Mesma lista/ícones/permissão do menu lateral, tudo junto num grid só
    // (sem separar por segmento), em quadrados grandes pra abrir com um
    // toque — tipo um app. Já filtra sozinho pra mostrar só o que o
    // perfil logado pode acessar e o que não está oculto no momento.
    const items = user
        ? menu
            .flatMap((group) => group.items)
            .filter(
                (item) =>
                    item.href !== '/home' &&
                    item.roles.includes(user.role) &&
                    !item.hidden,
            )
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
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        {items.map((item) => {
                            const Icon = item.icon;
                            const colors = menuColorStyles[item.color];

                            return (
                                <button
                                    type="button"
                                    key={item.href}
                                    onClick={() => router.push(item.href)}
                                    className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center transition hover:border-zinc-300 dark:hover:border-zinc-700"
                                >
                                    <div
                                        className={`rounded-2xl p-4 ${colors.bg} ${colors.text}`}
                                    >
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
