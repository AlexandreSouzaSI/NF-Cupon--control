import { CheckCircle2 } from 'lucide-react';

import { formatBRL, type PlanDto } from '@/lib/billing';

// Card de plano — usado na landing e em /planos. Os módulos vêm como chave
// (COMPRAS...) e são traduzidos pelo mapa de rótulos que a própria API
// /plans devolve, então não duplica a lista de nomes no frontend.
export function PlanCard({
    plan,
    moduleLabels,
    highlighted,
    current,
    footer,
}: {
    plan: PlanDto;
    moduleLabels: Record<string, string>;
    highlighted?: boolean;
    current?: boolean;
    footer?: React.ReactNode;
}) {
    return (
        <div
            className={`flex flex-col rounded-3xl border bg-white dark:bg-zinc-900 p-6 text-left ${highlighted
                    ? 'border-blue-500 shadow-lg shadow-blue-500/10'
                    : 'border-zinc-200 dark:border-zinc-800'
                }`}
        >
            <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{plan.name}</h3>

                {current && (
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                        Seu plano
                    </span>
                )}
            </div>

            {plan.description && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {plan.description}
                </p>
            )}

            <p className="mt-4">
                <span className="text-3xl font-bold">
                    {formatBRL(plan.priceCents)}
                </span>
                <span className="text-sm text-zinc-500"> /mês</span>
            </p>

            <ul className="mt-5 flex-1 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                {plan.modules.map((module) => (
                    <li key={module} className="flex items-start gap-2">
                        <CheckCircle2
                            size={16}
                            className="mt-0.5 shrink-0 text-blue-400"
                        />
                        {moduleLabels[module] || module}
                    </li>
                ))}
            </ul>

            {footer && <div className="mt-6">{footer}</div>}
        </div>
    );
}
