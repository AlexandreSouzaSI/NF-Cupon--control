'use client';

import { useEffect, useState } from 'react';

import { AppLayout } from '../../src/components/app-layout';

import { api } from '@/lib/api';

import {
    AlertTriangle,
    CheckCircle2,
    Plus,
    ShieldCheck,
} from 'lucide-react';

import { toast } from 'sonner';

type ApprovalRule = {
    id: string;
    name: string;
    minValue: number;
    maxValue?: number | null;
    level: 'AUTO' | 'MANAGER' | 'OWNER';
    store?: {
        id: string;
        name: string;
    } | null;
};

const levelLabel = {
    AUTO: 'Automática',
    MANAGER: 'Gerência',
    OWNER: 'Proprietário',
};

const levelColor = {
    AUTO: 'text-green-400',
    MANAGER: 'text-yellow-400',
    OWNER: 'text-red-400',
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function ApprovalRulesPage() {
    const [rules, setRules] = useState<ApprovalRule[]>([]);
    const [loading, setLoading] = useState(true);

    const [creating, setCreating] = useState(false);

    const [name, setName] = useState('');
    const [minValue, setMinValue] = useState('');
    const [maxValue, setMaxValue] = useState('');
    const [level, setLevel] =
        useState<'AUTO' | 'MANAGER' | 'OWNER'>(
            'MANAGER',
        );

    async function loadRules() {
        try {
            setLoading(true);

            const response = await api.get(
                '/approval-rules',
            );

            setRules(response.data);
        } catch {
            toast.error(
                'Erro ao carregar regras',
            );
        } finally {
            setLoading(false);
        }
    }

    async function createRule(
        e: React.FormEvent,
    ) {
        e.preventDefault();

        if (!name || !minValue) {
            toast.error(
                'Preencha nome e valor mínimo',
            );
            return;
        }

        try {
            setCreating(true);

            await api.post('/approval-rules', {
                name,
                minValue: Number(
                    minValue.replace(',', '.'),
                ),
                maxValue: maxValue
                    ? Number(
                        maxValue.replace(',', '.'),
                    )
                    : undefined,
                level,
            });

            toast.success(
                'Regra criada com sucesso',
            );

            setName('');
            setMinValue('');
            setMaxValue('');
            setLevel('MANAGER');

            await loadRules();
        } catch {
            toast.error(
                'Erro ao criar regra',
            );
        } finally {
            setCreating(false);
        }
    }

    useEffect(() => {
        loadRules();
    }, []);

    return (
        <AppLayout title="Regras de Aprovação">
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
                <form
                    onSubmit={createRule}
                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                            <Plus size={22} />
                        </div>

                        <div>
                            <h2 className="text-lg font-bold">
                                Nova regra
                            </h2>

                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Controle automático de aprovação
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Nome da regra
                            </label>

                            <input
                                value={name}
                                onChange={(e) =>
                                    setName(e.target.value)
                                }
                                placeholder="Ex: Compras pequenas"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Valor mínimo
                            </label>

                            <input
                                value={minValue}
                                onChange={(e) =>
                                    setMinValue(e.target.value)
                                }
                                placeholder="0,00"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Valor máximo
                            </label>

                            <input
                                value={maxValue}
                                onChange={(e) =>
                                    setMaxValue(e.target.value)
                                }
                                placeholder="500,00"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Tipo de aprovação
                            </label>

                            <select
                                value={level}
                                onChange={(e) =>
                                    setLevel(
                                        e.target.value as any,
                                    )
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            >
                                <option value="AUTO">
                                    Aprovação automática
                                </option>

                                <option value="MANAGER">
                                    Aprovação gerência
                                </option>

                                <option value="OWNER">
                                    Aprovação proprietário
                                </option>
                            </select>
                        </div>

                        <button
                            disabled={creating}
                            className="h-12 w-full rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {creating
                                ? 'Salvando...'
                                : 'Criar regra'}
                        </button>
                    </div>
                </form>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold">
                                Regras cadastradas
                            </h2>

                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Fluxos automáticos de aprovação
                            </p>
                        </div>

                        <ShieldCheck className="text-zinc-500" />
                    </div>

                    {loading ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Carregando...
                        </p>
                    ) : rules.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhuma regra cadastrada.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {rules.map((rule) => (
                                <div
                                    key={rule.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <h3 className="font-semibold">
                                                {rule.name}
                                            </h3>

                                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                {formatCurrency(
                                                    Number(rule.minValue),
                                                )}

                                                {rule.maxValue &&
                                                    ` até ${formatCurrency(
                                                        Number(
                                                            rule.maxValue,
                                                        ),
                                                    )}`}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {rule.level === 'AUTO' ? (
                                                <CheckCircle2
                                                    size={18}
                                                    className="text-green-400"
                                                />
                                            ) : (
                                                <AlertTriangle
                                                    size={18}
                                                    className={
                                                        levelColor[
                                                        rule.level
                                                        ]
                                                    }
                                                />
                                            )}

                                            <span
                                                className={`text-sm font-medium ${levelColor[
                                                    rule.level
                                                ]
                                                    }`}
                                            >
                                                {
                                                    levelLabel[
                                                    rule.level
                                                    ]
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}