'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Cookies from 'js-cookie';
import {
    AlertTriangle,
    CheckCircle2,
    ExternalLink,
    Loader2,
    TimerReset,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { getToken, getUser, logout } from '@/lib/auth';
import {
    fetchBillingMe,
    formatBRL,
    formatDateBR,
    type BillingMe,
    type PlanDto,
    type SubscriptionStatus,
} from '@/lib/billing';
import { PlanCard } from '../../src/components/plans/PlanCard';

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    PENDING: 'Aguardando pagamento',
    ACTIVE: 'Ativa',
    PAST_DUE: 'Vencida',
    CANCELED: 'Cancelada',
};

const PAYMENT_LABEL: Record<string, string> = {
    PENDING: 'Aguardando',
    RECEIVED: 'Paga',
    CONFIRMED: 'Paga',
    RECEIVED_IN_CASH: 'Paga',
    OVERDUE: 'Vencida',
    DELETED: 'Cancelada',
    REFUNDED: 'Estornada',
};

// Página PÚBLICA/semi-pública (fora do AppLayout de propósito): quem está
// com o teste vencido ou com a assinatura vencida não consegue passar pelo
// layout normal (a API devolve 403 pro resto do sistema), mas aqui sempre
// chega — /plans e /billing são as únicas rotas liberadas pra esses casos.
function PlanosContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const motivo = searchParams.get('motivo');

    const [plans, setPlans] = useState<PlanDto[]>([]);
    const [moduleLabels, setModuleLabels] = useState<Record<string, string>>({});
    const [plansLoaded, setPlansLoaded] = useState(false);

    const [loggedIn, setLoggedIn] = useState(false);
    const [me, setMe] = useState<BillingMe | null>(null);
    const [meLoaded, setMeLoaded] = useState(false);

    const [selectedPlan, setSelectedPlan] = useState<PlanDto | null>(null);
    const [cpfCnpj, setCpfCnpj] = useState('');
    const [empresaName, setEmpresaName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [canceling, setCanceling] = useState(false);

    // Atualiza o cookie `user` com o estado que o servidor devolve: depois
    // do pagamento a conta de teste vira real (isDemo=false, Proprietário)
    // e o banner de contagem regressiva/limitações do teste precisam sumir
    // sem deslogar.
    const syncUserCookie = useCallback((data: BillingMe) => {
        if (data.exempt) return;

        const current = getUser();

        if (!current) return;

        if (
            current.isDemo !== data.account.isDemo ||
            current.role !== data.account.role
        ) {
            Cookies.set(
                'user',
                JSON.stringify({
                    ...current,
                    role: data.account.role,
                    isDemo: data.account.isDemo,
                    demoExpiresAt: data.account.demoExpiresAt,
                    empresaId: data.account.empresaId,
                }),
            );
        }
    }, []);

    const loadMe = useCallback(
        async (sync: boolean) => {
            try {
                const data = await fetchBillingMe(sync);
                setMe(data);
                syncUserCookie(data);
            } catch (error: any) {
                // Token inválido/expirado de verdade: trata como visitante.
                if (error?.response?.status === 401) {
                    setLoggedIn(false);
                }
            } finally {
                setMeLoaded(true);
            }
        },
        [syncUserCookie],
    );

    useEffect(() => {
        api
            .get('/plans')
            .then((response) => {
                setPlans(response.data.plans);
                setModuleLabels(response.data.moduleLabels || {});
            })
            .catch(() => toast.error('Não deu pra carregar os planos.'))
            .finally(() => setPlansLoaded(true));

        if (getToken() && getUser()) {
            setLoggedIn(true);
            // sync=1: confere no Asaas o pagamento (rede de segurança do
            // webhook) toda vez que a página abre.
            loadMe(true);
        } else {
            setMeLoaded(true);
        }
    }, [loadMe]);

    // Enquanto a assinatura espera o 1º pagamento, consulta de tempos em
    // tempos — assim, voltando do Asaas, a tela vira "Ativa" sozinha.
    const subscriptionStatus =
        me && !me.exempt ? me.subscription?.status : undefined;

    useEffect(() => {
        if (subscriptionStatus !== 'PENDING') return;

        const interval = setInterval(() => loadMe(true), 8000);

        return () => clearInterval(interval);
    }, [subscriptionStatus, loadMe]);

    function openCheckout(plan: PlanDto) {
        setSelectedPlan(plan);

        if (me && !me.exempt) {
            setCpfCnpj(me.empresa?.cnpj || '');
            setEmpresaName(me.empresa?.name || '');
        }
    }

    async function handleCheckout(event: React.FormEvent) {
        event.preventDefault();

        if (!selectedPlan) return;

        try {
            setSubmitting(true);

            const response = await api.post('/billing/checkout', {
                planId: selectedPlan.id,
                cpfCnpj: cpfCnpj.trim() || undefined,
                empresaName: empresaName.trim() || undefined,
            });

            if (response.data.invoiceUrl) {
                // Link de pagamento hospedado pelo Asaas (Pix/boleto/cartão).
                window.location.href = response.data.invoiceUrl;
                return;
            }

            toast.success(
                'Cobrança gerada! Estamos preparando o link de pagamento...',
            );
            setSelectedPlan(null);
            await loadMe(true);
        } catch (error: any) {
            const raw = error?.response?.data?.message;
            toast.error(
                Array.isArray(raw)
                    ? raw.join(', ')
                    : raw || 'Não foi possível gerar a cobrança.',
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancel() {
        if (
            !window.confirm(
                'Cancelar a renovação? Os módulos continuam liberados até o fim do período já pago.',
            )
        ) {
            return;
        }

        try {
            setCanceling(true);
            await api.post('/billing/cancel');
            toast.success('Assinatura cancelada.');
            await loadMe(false);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Não foi possível cancelar.',
            );
        } finally {
            setCanceling(false);
        }
    }

    function handleLogout() {
        logout();
        router.push('/login');
    }

    const exempt = Boolean(me && me.exempt);
    const subscription = me && !me.exempt ? me.subscription : null;
    const isActive = subscription?.status === 'ACTIVE';
    const canManageBilling = Boolean(me && !me.exempt && me.canManageBilling);
    const trialExpired = Boolean(me && !me.exempt && me.trialExpired);
    const isTrialNow = Boolean(me && !me.exempt && me.isTrial && !me.trialExpired);
    const needsEmpresaName = Boolean(me && !me.exempt && !me.empresa);

    return (
        <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white">
            <header className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
                    <Link href="/">
                        <img
                            src="/logo-galho-hub.png"
                            alt="Galho Hub"
                            className="h-9 w-auto rounded-lg"
                        />
                    </Link>

                    <div className="flex items-center gap-2">
                        {loggedIn && !trialExpired && (
                            <Link
                                href="/home"
                                className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                                Voltar ao sistema
                            </Link>
                        )}

                        {loggedIn ? (
                            <button
                                onClick={handleLogout}
                                className="rounded-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                                Sair
                            </button>
                        ) : (
                            <Link
                                href="/login"
                                className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
                            >
                                Entrar
                            </Link>
                        )}
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
                {/* Empresa isenta (Nugalho) ou Admin Master: nada de planos. */}
                {exempt ? (
                    <div className="mx-auto max-w-lg rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                        <CheckCircle2 className="mx-auto text-emerald-500" size={32} />
                        <h1 className="mt-3 text-xl font-bold">
                            Sua conta não precisa de plano
                        </h1>
                        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                            Essa empresa tem acesso liberado ao sistema, sem
                            cobrança.
                        </p>
                        <Link
                            href="/home"
                            className="mt-5 inline-flex rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
                        >
                            Ir para o sistema
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="text-center">
                            <h1 className="text-3xl font-bold sm:text-4xl">
                                Escolha o plano da sua empresa
                            </h1>
                            <p className="mx-auto mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
                                Cobrança mensal por Pix, boleto ou cartão. Pagou,
                                os módulos do plano são liberados na hora — com
                                tudo que você já cadastrou.
                            </p>
                        </div>

                        {(motivo === 'teste-expirado' || trialExpired) && (
                            <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                                <TimerReset className="mt-0.5 shrink-0 text-amber-500" size={20} />
                                <p>
                                    <strong>Seu teste grátis de 1h acabou.</strong>{' '}
                                    Escolha um plano para continuar usando — tudo o
                                    que você cadastrou no teste é mantido quando o
                                    pagamento for confirmado.
                                </p>
                            </div>
                        )}

                        {isTrialNow && (
                            <div className="mx-auto flex max-w-3xl items-start gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm">
                                <TimerReset className="mt-0.5 shrink-0 text-blue-500" size={20} />
                                <p>
                                    Você está no teste grátis. Assinando agora, sua
                                    conta de teste vira a conta real da sua empresa,
                                    sem perder nada.
                                </p>
                            </div>
                        )}

                        {/* Situação da assinatura */}
                        {subscription && (
                            <section className="mx-auto max-w-3xl rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                                            Sua assinatura
                                        </p>
                                        <h2 className="text-xl font-bold">
                                            {subscription.plan.name} —{' '}
                                            {formatBRL(subscription.plan.priceCents)}/mês
                                        </h2>
                                    </div>

                                    <span
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${subscription.status === 'ACTIVE'
                                                ? 'bg-emerald-500/10 text-emerald-500'
                                                : subscription.status === 'PAST_DUE'
                                                    ? 'bg-red-500/10 text-red-500'
                                                    : 'bg-amber-500/10 text-amber-500'
                                            }`}
                                    >
                                        {STATUS_LABEL[subscription.status]}
                                    </span>
                                </div>

                                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                                    <div>
                                        <dt className="text-zinc-500">Vence em</dt>
                                        <dd className="font-medium">
                                            {formatDateBR(subscription.currentPeriodEnd)}
                                        </dd>
                                    </div>
                                    {subscription.status === 'PAST_DUE' && (
                                        <div>
                                            <dt className="text-zinc-500">Situação</dt>
                                            <dd className="font-medium text-red-500">
                                                Módulos pausados até o pagamento
                                            </dd>
                                        </div>
                                    )}
                                </dl>

                                {subscription.status === 'PENDING' && (
                                    <p className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                                        <Loader2 size={16} className="animate-spin" />
                                        Aguardando a confirmação do pagamento — esta
                                        tela atualiza sozinha.
                                    </p>
                                )}

                                {subscription.status === 'PAST_DUE' && (
                                    <p className="mt-4 flex items-start gap-2 text-sm text-red-500">
                                        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                        Pague a cobrança em aberto para liberar os
                                        módulos novamente.
                                    </p>
                                )}

                                <div className="mt-5 flex flex-wrap gap-3">
                                    {subscription.openInvoiceUrl && (
                                        <a
                                            href={subscription.openInvoiceUrl}
                                            className="inline-flex items-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-600"
                                        >
                                            Pagar cobrança em aberto
                                            <ExternalLink size={16} />
                                        </a>
                                    )}

                                    {isActive && (
                                        <Link
                                            href="/home"
                                            className="inline-flex rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
                                        >
                                            Ir para o sistema
                                        </Link>
                                    )}

                                    {subscription.status !== 'CANCELED' &&
                                        canManageBilling && (
                                            <button
                                                onClick={handleCancel}
                                                disabled={canceling}
                                                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-2.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                                            >
                                                Cancelar assinatura
                                            </button>
                                        )}
                                </div>

                                {subscription.payments.length > 0 && (
                                    <div className="mt-6">
                                        <p className="mb-2 text-sm font-semibold">
                                            Cobranças
                                        </p>
                                        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
                                            {subscription.payments.map((payment) => (
                                                <li
                                                    key={payment.id}
                                                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                                                >
                                                    <span>
                                                        {formatDateBR(payment.dueDate)} —{' '}
                                                        {formatBRL(payment.valueCents)}
                                                    </span>
                                                    <span className="flex items-center gap-3">
                                                        <span className="text-zinc-500">
                                                            {PAYMENT_LABEL[payment.status] ||
                                                                payment.status}
                                                        </span>
                                                        {payment.invoiceUrl && (
                                                            <a
                                                                href={payment.invoiceUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-blue-500 hover:underline"
                                                            >
                                                                Abrir
                                                            </a>
                                                        )}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Cards dos planos */}
                        {!plansLoaded || !meLoaded ? (
                            <p className="text-center text-sm text-zinc-500">
                                Carregando planos...
                            </p>
                        ) : plans.length === 0 ? (
                            <p className="text-center text-sm text-zinc-500">
                                Os planos ainda estão sendo preparados. Fale com a
                                gente para liberar o seu acesso.
                            </p>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {plans.map((plan) => {
                                    const isCurrent =
                                        subscription?.plan.id === plan.id &&
                                        subscription.status !== 'CANCELED';

                                    let footer: React.ReactNode;

                                    if (!loggedIn) {
                                        footer = (
                                            <div className="space-y-2">
                                                <Link
                                                    href="/demo"
                                                    className="flex h-11 w-full items-center justify-center rounded-xl bg-blue-500 font-semibold text-white hover:bg-blue-600"
                                                >
                                                    Testar grátis e assinar
                                                </Link>
                                                <Link
                                                    href="/login"
                                                    className="block text-center text-sm text-zinc-500 hover:text-blue-500"
                                                >
                                                    Já tenho conta
                                                </Link>
                                            </div>
                                        );
                                    } else if (isActive) {
                                        footer = isCurrent ? null : (
                                            <p className="text-center text-xs text-zinc-500">
                                                Para trocar de plano, fale com o
                                                suporte.
                                            </p>
                                        );
                                    } else if (!canManageBilling) {
                                        footer = (
                                            <p className="text-center text-xs text-zinc-500">
                                                Só Proprietário ou Administrativo pode
                                                assinar.
                                            </p>
                                        );
                                    } else {
                                        footer = (
                                            <button
                                                onClick={() => openCheckout(plan)}
                                                className="h-11 w-full rounded-xl bg-blue-500 font-semibold text-white hover:bg-blue-600"
                                            >
                                                Assinar
                                            </button>
                                        );
                                    }

                                    return (
                                        <PlanCard
                                            key={plan.id}
                                            plan={plan}
                                            moduleLabels={moduleLabels}
                                            current={isCurrent}
                                            highlighted={isCurrent}
                                            footer={footer}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modal de checkout: pede o documento de quem paga (Asaas exige) */}
            {selectedPlan && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <form
                        onSubmit={handleCheckout}
                        className="w-full max-w-md space-y-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
                    >
                        <div>
                            <h2 className="text-lg font-bold">
                                Assinar {selectedPlan.name}
                            </h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {formatBRL(selectedPlan.priceCents)} por mês. Na
                                próxima tela você escolhe Pix, boleto ou cartão.
                            </p>
                        </div>

                        {needsEmpresaName && (
                            <div>
                                <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Nome da empresa
                                </label>
                                <input
                                    required
                                    value={empresaName}
                                    onChange={(e) => setEmpresaName(e.target.value)}
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                                />
                            </div>
                        )}

                        <div>
                            <label className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">
                                CPF ou CNPJ de quem vai pagar
                            </label>
                            <input
                                required
                                inputMode="numeric"
                                value={cpfCnpj}
                                onChange={(e) => setCpfCnpj(e.target.value)}
                                placeholder="Somente números"
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                                Necessário para emitir a cobrança.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedPlan(null)}
                                disabled={submitting}
                                className="h-11 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Voltar
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-blue-500 font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <Loader2 className="animate-spin" size={18} />
                                ) : (
                                    'Ir para o pagamento'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </main>
    );
}

// useSearchParams exige Suspense no build do Next (ver tarefa de
// "useSearchParams sem Suspense").
export default function PlanosPage() {
    return (
        <Suspense fallback={null}>
            <PlanosContent />
        </Suspense>
    );
}
