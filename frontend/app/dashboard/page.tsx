'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

type TeamTaskStat = {
    userId: string;
    userName: string;
    aFazer: number;
    emAndamento: number;
    pausada: number;
    atraso: number;
    concluidas: number;
};

type DashboardSummary = {
    referenceMonth: string;

    tasks: {
        pendingToday: number;
        team: TeamTaskStat[];
    };
};

function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(value: string, delta: number) {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(value: string) {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    const label = date.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function DashboardPage() {
    const router = useRouter();

    const [summary, setSummary] = useState<DashboardSummary | null>(
        null,
    );

    const [loading, setLoading] = useState(true);
    const [selectedMonth, setSelectedMonth] = useState(currentMonthValue());

    async function loadSummary() {
        try {
            setLoading(true);

            const response = await api.get('/dashboard/summary', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    month: selectedMonth,
                },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar dashboard.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth]);

    // Botão de mês do Dashboard: setas pra andar mês a mês + o mês atual
    // clicável pra digitar direto. Só o "Concluídas (mês)" do quadro por
    // pessoa muda com isso — o resto do quadro continua o estado atual.
    const monthSelector = (
        <div className="inline-flex items-center gap-1 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1">
            <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Mês anterior"
            >
                <ChevronLeft size={18} />
            </button>

            <label className="relative flex h-9 min-w-[9.5rem] cursor-pointer items-center justify-center rounded-xl px-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
                {formatMonthLabel(selectedMonth)}
                <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) =>
                        e.target.value && setSelectedMonth(e.target.value)
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </label>

            <button
                type="button"
                onClick={() => setSelectedMonth((prev) => shiftMonth(prev, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                title="Próximo mês"
            >
                <ChevronRight size={18} />
            </button>

            {selectedMonth !== currentMonthValue() && (
                <button
                    type="button"
                    onClick={() => setSelectedMonth(currentMonthValue())}
                    className="ml-1 h-9 rounded-xl px-3 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
                >
                    Hoje
                </button>
            )}
        </div>
    );

    if (loading) {
        return (
            <AppLayout title="Dashboard">
                <div className="space-y-4">
                    {monthSelector}
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Carregando tarefas...
                    </p>
                </div>
            </AppLayout>
        );
    }

    if (!summary) {
        return (
            <AppLayout title="Dashboard">
                <div className="space-y-4">
                    {monthSelector}

                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Não foi possível carregar o dashboard.
                        </p>

                        <button
                            type="button"
                            onClick={loadSummary}
                            className="mt-4 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                        >
                            Tentar novamente
                        </button>
                    </div>
                </div>
            </AppLayout>
        );
    }

    // Tarefas em aberto da equipe inteira (soma de todo mundo no quadro
    // geral) — só quem enxerga o quadro geral (Proprietário/Administrativo)
    // recebe summary.tasks.team preenchido; os demais perfis caem no
    // fallback pessoal (mesma pendência que já viam antes).
    const teamOpenTasks = summary.tasks.team.reduce(
        (sum, person) => sum + person.aFazer + person.emAndamento + person.atraso,
        0,
    );
    const isTeamTaskView = summary.tasks.team.length > 0;

    return (
        <AppLayout title="Dashboard">
            <div className="space-y-6">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">Tarefas</h2>

                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            O resto do dashboard mudou pra cada módulo — aqui
                            fica só o que precisa ser feito.
                        </p>
                    </div>

                    {monthSelector}
                </header>

                <section className="grid grid-cols-1 gap-4 sm:max-w-xs">
                    <button
                        type="button"
                        onClick={() => router.push('/tasks')}
                        className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-200/70 dark:hover:bg-zinc-800/70"
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="rounded-2xl p-3 text-violet-400 bg-violet-500/10">
                                <ListChecks size={22} />
                            </div>

                            <span className="rounded-full bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1 text-xs text-zinc-500">
                                abrir
                            </span>
                        </div>

                        <strong className="block text-3xl">
                            {isTeamTaskView ? teamOpenTasks : summary.tasks.pendingToday}
                        </strong>

                        <p className="mt-2 font-medium">Tarefas</p>

                        <p className="mt-1 text-sm text-zinc-500">
                            {isTeamTaskView
                                ? 'Em aberto na equipe (loja ativa)'
                                : 'Suas tarefas a fazer ou atrasadas até hoje'}
                        </p>
                    </button>
                </section>

                {summary.tasks.team.length > 0 && (
                    <section className="space-y-3">
                        <div>
                            <h3 className="text-lg font-bold">
                                Quadro de tarefas por pessoa
                            </h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Quem está com o quê na loja ativa — toque num
                                card pra abrir as tarefas dessa pessoa
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {summary.tasks.team.map((person) => (
                                <button
                                    type="button"
                                    key={person.userId}
                                    onClick={() =>
                                        router.push(
                                            `/tasks?tab=quadro&assignee=${person.userId}&assigneeName=${encodeURIComponent(person.userName)}`,
                                        )
                                    }
                                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/70"
                                >
                                    <p className="font-semibold">
                                        Tarefas de {person.userName}
                                    </p>

                                    <div className="mt-3 space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                                Concluídas (mês)
                                            </span>
                                            <span className="font-semibold">
                                                {person.concluidas}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                                                Em andamento
                                            </span>
                                            <span className="font-semibold">
                                                {person.emAndamento}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-amber-500" />
                                                Pausada
                                            </span>
                                            <span className="font-semibold">
                                                {person.pausada}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-red-500" />
                                                Em atraso
                                            </span>
                                            <span className="font-semibold">
                                                {person.atraso}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                                                <span className="h-2 w-2 rounded-full bg-zinc-400" />
                                                A fazer
                                            </span>
                                            <span className="font-semibold">
                                                {person.aFazer}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </AppLayout>
    );
}
