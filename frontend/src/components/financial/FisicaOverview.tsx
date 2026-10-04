'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Calendar,
    CalendarDays,
    CheckCircle2,
    Clock,
    ListPlus,
    ListX,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

// Dashboard Financeiro da loja Pessoa Física: a pessoa só quer saber o que
// precisa pagar. Quatro números grandes (Atrasadas, Hoje, Próximos 7 dias,
// Restante do mês) + lista curta dos próximos vencimentos. Cada card leva
// pra Contas a Pagar já no card de período correspondente (?card=), que usa
// as mesmas regras de matchesPeriod daquela tela — então o número clicado
// bate com a lista que abre.

type Total = { count: number; value: number };

type Overview = {
    referencia: { hoje: string; semanaAte: string; mesAte: string };
    atrasadas: Total;
    hoje: Total & { vencendoHoje: Total; atrasadasNaFila: Total };
    semana: Total;
    mes: Total;
    proximas: {
        id: string;
        description: string;
        value: number;
        dueDate: string;
        fornecedor: string | null;
        categoria: string | null;
        queuedForPaymentAt: string | null;
        situacao: 'ATRASADA' | 'HOJE' | 'A_VENCER';
    }[];
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

// dueDate vem como ISO ao meio-dia UTC — formata em UTC pra nunca recuar
// de dia por fuso (mesma regra de bills/page.tsx).
function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// "yyyy-mm-dd" → "dd/mm" sem passar por Date (evita fuso).
function shortDate(ymd: string) {
    const [, month, day] = ymd.split('-');
    return `${day}/${month}`;
}

function monthName(ymd: string) {
    const [year, month] = ymd.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
    });
}

function daysUntil(dueDate: string, todayYmd: string) {
    const due = new Date(dueDate).getTime();
    const today = new Date(`${todayYmd}T12:00:00.000Z`).getTime();
    return Math.round((due - today) / 86400000);
}

export function FisicaOverview() {
    const router = useRouter();
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            const response = await api.get(
                '/financial-dashboard/overview-fisica',
                { params: { storeId: store.id } },
            );
            setData(response.data);
        } catch {
            toast.error('Erro ao carregar o dashboard financeiro.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function pay(id: string, description: string) {
        if (!window.confirm(`Marcar "${description}" como paga?`)) return;

        try {
            setBusyId(id);
            await api.patch(`/bills/${id}/pay`, {});
            toast.success('Conta marcada como paga.');
            await load();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                    'Erro ao marcar conta como paga.',
            );
        } finally {
            setBusyId(null);
        }
    }

    // Só faz sentido pra vencida: ela continua "atrasada", mas passa a
    // contar também em "Hoje" (mesma regra da tela de Contas a Pagar).
    async function toggleQueue(id: string) {
        try {
            setBusyId(id);
            await api.patch(`/bills/${id}/queue-today`);
            await load();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                    'Erro ao atualizar a fila de hoje.',
            );
        } finally {
            setBusyId(null);
        }
    }

    if (loading && !data) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Carregando...
            </p>
        );
    }

    if (!data) return null;

    const ref = data.referencia;

    const cards = [
        {
            key: 'OVERDUE',
            title: 'Atrasadas',
            icon: AlertTriangle,
            total: data.atrasadas,
            hint: 'Vencimento já passou e ainda não foi pago',
            box: 'border-red-500/40 bg-red-500/10 hover:bg-red-500/15',
            text: 'text-red-500',
        },
        {
            key: 'TODAY',
            title: 'Hoje',
            icon: Clock,
            total: data.hoje,
            hint:
                data.hoje.atrasadasNaFila.count > 0
                    ? `Inclui ${data.hoje.atrasadasNaFila.count} atrasada(s) colocada(s) na fila de hoje`
                    : `Vencem em ${shortDate(ref.hoje)}`,
            box: 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/15',
            text: 'text-orange-500',
        },
        {
            key: 'WEEK',
            title: 'Próximos 7 dias',
            icon: CalendarDays,
            total: data.semana,
            hint: `De hoje até ${shortDate(ref.semanaAte)}`,
            box: 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/15',
            text: 'text-cyan-500',
        },
        {
            key: 'MONTH',
            title: `Restante de ${monthName(ref.hoje)}`,
            icon: Calendar,
            total: data.mes,
            hint: `De hoje até ${shortDate(ref.mesAte)}`,
            box: 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/15',
            text: 'text-purple-500',
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold">Dashboard Financeiro</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    O que você precisa pagar — só contas em aberto.
                </p>
            </div>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((card) => {
                    const Icon = card.icon;

                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={() =>
                                router.push(`/bills?card=${card.key}`)
                            }
                            className={`rounded-3xl border p-5 text-left transition ${card.box}`}
                        >
                            <p
                                className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${card.text}`}
                            >
                                <Icon size={16} />
                                {card.title}
                            </p>
                            <strong className="mt-3 block text-3xl">
                                {formatCurrency(card.total.value)}
                            </strong>
                            <p className="mt-1 text-sm font-medium">
                                {card.total.count} conta(s)
                            </p>
                            <p className="mt-2 text-xs text-zinc-500">
                                {card.hint}
                            </p>
                        </button>
                    );
                })}
            </section>

            <section className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                        Próximos vencimentos
                    </h3>
                    <button
                        type="button"
                        onClick={() => router.push('/bills')}
                        className="text-xs font-medium text-teal-600 hover:underline dark:text-teal-400"
                    >
                        Ver todas as contas
                    </button>
                </div>

                {data.proximas.length === 0 ? (
                    <p className="py-6 text-center text-sm text-zinc-500">
                        Nenhuma conta em aberto. Tudo em dia!
                    </p>
                ) : (
                    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {data.proximas.map((bill) => {
                            const days = daysUntil(bill.dueDate, ref.hoje);
                            const badge =
                                bill.situacao === 'ATRASADA'
                                    ? {
                                          label: `Atrasada há ${Math.abs(days)} dia(s)`,
                                          cls: 'border-red-500/30 bg-red-500/10 text-red-500',
                                      }
                                    : bill.situacao === 'HOJE'
                                      ? {
                                            label: 'Vence hoje',
                                            cls: 'border-orange-500/30 bg-orange-500/10 text-orange-500',
                                        }
                                      : {
                                            label:
                                                days === 1
                                                    ? 'Amanhã'
                                                    : `Em ${days} dias`,
                                            cls: 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
                                        };

                            return (
                                <li
                                    key={bill.id}
                                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                `/bills?billId=${bill.id}`,
                                            )
                                        }
                                        className="min-w-0 flex-1 text-left hover:opacity-80"
                                    >
                                        <p className="truncate text-sm font-medium">
                                            {bill.fornecedor ||
                                                bill.description}
                                        </p>
                                        <p className="truncate text-xs text-zinc-500">
                                            {bill.fornecedor
                                                ? bill.description
                                                : bill.categoria ||
                                                  'Sem categoria'}{' '}
                                            · {formatDate(bill.dueDate)}
                                        </p>
                                    </button>

                                    <span
                                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}
                                    >
                                        {badge.label}
                                        {bill.situacao === 'ATRASADA' &&
                                        bill.queuedForPaymentAt
                                            ? ' · na fila de hoje'
                                            : ''}
                                    </span>

                                    <strong className="w-28 text-right text-sm">
                                        {formatCurrency(bill.value)}
                                    </strong>

                                    <div className="flex gap-2">
                                        {bill.situacao === 'ATRASADA' && (
                                            <button
                                                type="button"
                                                disabled={busyId === bill.id}
                                                onClick={() =>
                                                    toggleQueue(bill.id)
                                                }
                                                title={
                                                    bill.queuedForPaymentAt
                                                        ? 'Tirar da fila de hoje'
                                                        : 'Colocar na fila de hoje'
                                                }
                                                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                                            >
                                                {bill.queuedForPaymentAt ? (
                                                    <ListX size={16} />
                                                ) : (
                                                    <ListPlus size={16} />
                                                )}
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            disabled={busyId === bill.id}
                                            onClick={() =>
                                                pay(bill.id, bill.description)
                                            }
                                            className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                                        >
                                            <CheckCircle2 size={14} />
                                            Pagar
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
