'use client';

import { useState } from 'react';

import { api } from '@/lib/api';

import Cookies from 'js-cookie';

import { useRouter } from 'next/navigation';

import { Loader2, TimerReset } from 'lucide-react';

import { toast } from 'sonner';

export default function DemoSignupPage() {
    const router = useRouter();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [loading, setLoading] = useState(false);

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault();

        try {
            setLoading(true);

            const response = await api.post('/demo/signup', {
                name: name.trim() || undefined,
                email,
                password,
            });

            Cookies.set('token', response.data.access_token);

            Cookies.set(
                'user',
                JSON.stringify(response.data.user),
            );

            toast.success('Teste liberado por 1h — aproveite!');

            router.push('/home');
        } catch (error: any) {
            const status = error?.response?.status;
            const rawMessage = error?.response?.data?.message;
            const message = Array.isArray(rawMessage)
                ? rawMessage.join(', ')
                : rawMessage || 'Não foi possível iniciar o teste.';

            if (status === 409) {
                // E-mail já usado num teste anterior — a pessoa precisa
                // entrar com a conta que já existe, não criar outra.
                toast.error(
                    'Esse e-mail já tem um teste criado. Use o botão "Entrar" abaixo com a senha que você definiu.',
                );
            } else {
                toast.error(message);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
            <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl">
                <div className="mb-8">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-500">
                        <TimerReset size={14} />
                        Teste grátis por 1 hora
                    </div>

                    <h1 className="text-3xl font-bold">
                        Testar o Controle Compras
                    </h1>

                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        Crie um acesso temporário pra explorar o sistema com
                        dados de demonstração. Sem cartão, sem compromisso —
                        e some sozinho depois de 1h.
                    </p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Seu nome
                        </label>

                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Opcional"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            E-mail
                        </label>

                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Crie uma senha
                        </label>

                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-green-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="flex h-12 w-full items-center justify-center rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600 disabled:opacity-50"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" />
                        ) : (
                            'Começar teste de 1h'
                        )}
                    </button>

                    <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
                        Já criou um teste?{' '}
                        <button
                            type="button"
                            onClick={() => router.push('/')}
                            className="font-semibold text-green-500 hover:underline"
                        >
                            Entrar
                        </button>
                    </p>
                </form>
            </div>
        </main>
    );
}
