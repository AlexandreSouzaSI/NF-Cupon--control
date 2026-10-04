'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

import { api } from '@/lib/api';
import { useBillingStatus, type PlanDto } from '@/lib/billing';
import { PlanCard } from './PlanCard';

// Seção "Planos" da landing. Mostra os planos ativos cadastrados em
// /admin/planos (preço e módulos reais, nunca texto fixo) e leva pra /planos.
// Pra empresa isenta (Nugalho) e Admin Master a seção inteira some. Se ainda
// não há plano cadastrado, cai no texto genérico antigo (com botão de teste).
export function LandingPlansSection() {
    const { loaded, showPlansCta } = useBillingStatus();
    const [plans, setPlans] = useState<PlanDto[] | null>(null);
    const [moduleLabels, setModuleLabels] = useState<Record<string, string>>({});

    useEffect(() => {
        api
            .get('/plans')
            .then((response) => {
                setPlans(response.data.plans);
                setModuleLabels(response.data.moduleLabels || {});
            })
            .catch(() => setPlans([]));
    }, []);

    if (loaded && !showPlansCta) return null;

    return (
        <section
            id="planos"
            className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
        >
            <div className="mx-auto max-w-6xl px-4 py-16 text-center">
                <h2 className="text-3xl font-bold">Um plano do tamanho da sua rede</h2>

                <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
                    Assine mensalmente por Pix, boleto ou cartão. Pagou, os módulos
                    do plano são liberados na hora.
                </p>

                {plans && plans.length > 0 ? (
                    <>
                        <div className="mt-10 grid gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
                            {plans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    moduleLabels={moduleLabels}
                                />
                            ))}
                        </div>

                        <Link
                            href="/planos"
                            className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 font-semibold text-white transition hover:bg-blue-600"
                        >
                            Conhecer os planos
                            <ArrowRight size={18} />
                        </Link>
                    </>
                ) : (
                    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-8 text-left">
                        <p className="text-sm font-semibold text-blue-500">
                            Sob medida por empresa
                        </p>

                        <ul className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {[
                                'Compras, recebimento e conta a pagar',
                                'Nota fiscal de entrada, saída e de baixa por perda',
                                'Tarefas, RH e controle de tributos',
                                'Notificação por push e WhatsApp',
                            ].map((item) => (
                                <li key={item} className="flex items-start gap-2">
                                    <CheckCircle2
                                        size={18}
                                        className="mt-0.5 shrink-0 text-blue-400"
                                    />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        <Link
                            href="/demo"
                            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-500 font-semibold text-white transition hover:bg-blue-600"
                        >
                            Testar grátis
                            <ArrowRight size={18} />
                        </Link>
                    </div>
                )}
            </div>
        </section>
    );
}
