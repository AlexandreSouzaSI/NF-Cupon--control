'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';

import { KeyRound, Loader2, Mail, MessageCircle } from 'lucide-react';

import { toast } from 'sonner';

// Fluxo "esqueci minha senha" em 2 passos, os "2 cards" pedidos:
// 1) a pessoa digita telefone ou e-mail (mesmo "identifier" do login) e
//    a tela mostra os cartões mascarados de canal disponível (WhatsApp
//    e/ou e-mail) — ver getResetOptions em account.service.ts.
// 2) a pessoa escolhe o canal e a tela confirma que o link foi enviado.
// Público — sem AppLayout, sem guard de sessão.
type ResetOptions = {
    found: boolean;
    email: string | null;
    phone: string | null;
};

export default function ForgotPasswordPage() {
    const router = useRouter();

    const [step, setStep] = useState<'identify' | 'choose' | 'sent'>(
        'identify',
    );

    const [identifier, setIdentifier] = useState('');
    const [options, setOptions] = useState<ResetOptions | null>(null);
    const [loading, setLoading] = useState(false);
    const [sendingChannel, setSendingChannel] = useState<
        'EMAIL' | 'WHATSAPP' | null
    >(null);

    async function handleIdentify(e: React.FormEvent) {
        e.preventDefault();

        try {
            setLoading(true);

            const response = await api.post('/account/forgot-password', {
                identifier,
            });

            if (!response.data.found) {
                toast.error(
                    'Não encontramos uma conta com esse telefone ou e-mail.',
                );
                return;
            }

            setOptions(response.data);
            setStep('choose');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Não foi possível buscar a conta.',
            );
        } finally {
            setLoading(false);
        }
    }

    async function handleSend(channel: 'EMAIL' | 'WHATSAPP') {
        try {
            setSendingChannel(channel);

            await api.post('/account/forgot-password/send', {
                identifier,
                channel,
            });

            setStep('sent');
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Não foi possível enviar o link.',
            );
        } finally {
            setSendingChannel(null);
        }
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
            <div className="w-full max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 shadow-2xl">
                <div className="mb-8">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-500">
                        <KeyRound size={14} />
                        Esqueci minha senha
                    </div>

                    <h1 className="text-2xl font-bold">
                        {step === 'sent'
                            ? 'Link enviado'
                            : 'Recuperar acesso'}
                    </h1>

                    <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                        {step === 'identify' &&
                            'Digite seu telefone ou e-mail de login.'}
                        {step === 'choose' &&
                            'Escolha pra onde mandar o link de redefinição.'}
                        {step === 'sent' &&
                            'Confira a mensagem e abra o link pra criar uma nova senha.'}
                    </p>
                </div>

                {step === 'identify' && (
                    <form onSubmit={handleIdentify} className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                E-mail ou telefone
                            </label>

                            <input
                                type="text"
                                value={identifier}
                                onChange={(e) =>
                                    setIdentifier(e.target.value)
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none transition focus:border-blue-500"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                        >
                            {loading ? (
                                <Loader2 className="animate-spin" />
                            ) : (
                                'Continuar'
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push('/login')}
                            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Voltar pro login
                        </button>
                    </form>
                )}

                {step === 'choose' && options && (
                    <div className="space-y-3">
                        {options.phone && (
                            <button
                                type="button"
                                disabled={sendingChannel !== null}
                                onClick={() => handleSend('WHATSAPP')}
                                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 text-left transition hover:border-green-500/50 hover:bg-green-500/5 disabled:opacity-50"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                                    {sendingChannel === 'WHATSAPP' ? (
                                        <Loader2
                                            size={18}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <MessageCircle size={18} />
                                    )}
                                </span>

                                <span>
                                    <span className="block font-semibold">
                                        WhatsApp
                                    </span>

                                    <span className="block text-sm text-zinc-500">
                                        {options.phone}
                                    </span>
                                </span>
                            </button>
                        )}

                        {options.email && (
                            <button
                                type="button"
                                disabled={sendingChannel !== null}
                                onClick={() => handleSend('EMAIL')}
                                className="flex w-full items-center gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 text-left transition hover:border-blue-500/50 hover:bg-blue-500/5 disabled:opacity-50"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                                    {sendingChannel === 'EMAIL' ? (
                                        <Loader2
                                            size={18}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Mail size={18} />
                                    )}
                                </span>

                                <span>
                                    <span className="block font-semibold">
                                        E-mail
                                    </span>

                                    <span className="block text-sm text-zinc-500">
                                        {options.email}
                                    </span>
                                </span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={() => setStep('identify')}
                            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Voltar
                        </button>
                    </div>
                )}

                {step === 'sent' && (
                    <div className="space-y-4">
                        <p className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-600 dark:text-green-400">
                            Link enviado! Ele vale por 1 hora — se não
                            usar a tempo, volte aqui e peça de novo.
                        </p>

                        <button
                            type="button"
                            onClick={() => router.push('/login')}
                            className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 font-semibold text-white transition hover:bg-blue-600"
                        >
                            Ir pro login
                        </button>
                    </div>
                )}
            </div>
        </main>
    );
}
