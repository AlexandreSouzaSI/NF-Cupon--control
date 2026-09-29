'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { api } from '@/lib/api';

import Cookies from 'js-cookie';

import { Loader2, ShieldCheck } from 'lucide-react';

import { toast } from 'sonner';

// Página pública (sem login) que atende o link de convite mandado por
// WhatsApp/e-mail quando alguém cria uma conta em Cadastros → Usuários
// sem definir senha na hora (ver users.service.ts / account.service.ts
// no backend). A pessoa cai aqui, cria a senha, e já sai logada.
export default function ActivateAccountPage() {
    const params = useParams<{ token: string }>();
    const router = useRouter();

    const [loadingInfo, setLoadingInfo] = useState(true);
    const [invalid, setInvalid] = useState<string | null>(null);
    const [name, setName] = useState('');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        async function loadInfo() {
            try {
                const response = await api.get(
                    `/account/activate/${params.token}`,
                );

                setName(response.data.name);
            } catch (error: any) {
                setInvalid(
                    error?.response?.data?.message ||
                    'Link inválido ou expirado.',
                );
            } finally {
                setLoadingInfo(false);
            }
        }

        loadInfo();
    }, [params.token]);

    async function handleActivate(e: React.FormEvent) {
        e.preventDefault();

        if (password.length < 6) {
            toast.error('A senha precisa ter pelo menos 6 caracteres.');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('As senhas não conferem.');
            return;
        }

        try {
            setSubmitting(true);

            await api.post(`/account/activate/${params.token}`, {
                password,
            });

            toast.success('Conta ativada! Faça login pra continuar.');

            router.push('/login');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Não foi possível ativar a conta.',
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
            <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl">
                <div className="mb-8">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-500">
                        <ShieldCheck size={14} />
                        Ativação de conta
                    </div>

                    {loadingInfo ? (
                        <h1 className="text-2xl font-bold">
                            Verificando link...
                        </h1>
                    ) : invalid ? (
                        <h1 className="text-2xl font-bold">
                            Link inválido
                        </h1>
                    ) : (
                        <h1 className="text-2xl font-bold">
                            Bem-vindo(a), {name}
                        </h1>
                    )}

                    {!loadingInfo && !invalid && (
                        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                            Crie uma senha pra ativar sua conta.
                        </p>
                    )}
                </div>

                {loadingInfo && (
                    <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin text-zinc-400" />
                    </div>
                )}

                {!loadingInfo && invalid && (
                    <div className="space-y-4">
                        <p className="text-sm text-red-500">{invalid}</p>

                        <button
                            type="button"
                            onClick={() => router.push('/login')}
                            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Ir pro login
                        </button>
                    </div>
                )}

                {!loadingInfo && !invalid && (
                    <form onSubmit={handleActivate} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Nova senha
                            </label>

                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Confirmar senha
                            </label>

                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-blue-500"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                        >
                            {submitting ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                'Ativar conta'
                            )}
                        </button>
                    </form>
                )}
            </div>
        </main>
    );
}
