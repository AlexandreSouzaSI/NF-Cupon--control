'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { SingleDayFilter } from './SingleDayFilter';

type DayGroup = {
    dia: string;
    aguardandoConfirmacao?: boolean;
    produtos: { nome: string; quantidade: number; valor: number }[];
};

function formatDate(value: string) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
}

function formatMoney(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function ItemsPerDayTab() {
    const store = getActiveStore();

    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState<DayGroup[]>([]);
    const [openDay, setOpenDay] = useState<string | null>(null);
    const [day, setDay] = useState('');

    async function load() {
        if (!store) return;

        try {
            setLoading(true);
            const response = await api.get('/meep/itens-por-dia', {
                params: { storeId: store.id, dateFrom: day, dateTo: day },
            });
            setDays(response.data);
        } catch {
            toast.error('Erro ao carregar os itens vendidos por dia.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day]);

    if (!store) {
        return (
            <p className="text-sm text-zinc-500">
                Selecione uma loja pra ver os itens vendidos por dia.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <SingleDayFilter value={day} onChange={setDay} />

            {loading ? (
                <p className="text-sm text-zinc-500">Carregando...</p>
            ) : days.length === 0 ? (
                <p className="text-sm text-zinc-500">
                    Nenhuma venda sincronizada nesse período ainda.
                </p>
            ) : (
                <div className="space-y-2">
                    {days.map((day) => {
                        const isOpen = openDay === day.dia;
                        const totalDia = day.produtos.reduce(
                            (sum, p) => sum + p.valor,
                            0,
                        );

                        return (
                            <div
                                key={day.dia}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                            >
                                <button
                                    onClick={() =>
                                        setOpenDay(isOpen ? null : day.dia)
                                    }
                                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                                >
                                    <span className="flex items-center gap-2 text-sm font-semibold">
                                        {formatDate(day.dia)}
                                        {day.aguardandoConfirmacao && (
                                            <span
                                                title="A Meep só fecha os dados de um dia comercial por completo algum tempo depois da virada — esse dia ainda não foi confirmado, por isso o número não aparece ainda (evita mostrar venda parcial como se fosse o total do dia)."
                                                className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                                            >
                                                Aguardando informação
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-sm text-zinc-500">
                                        {day.aguardandoConfirmacao
                                            ? 'Número final sai depois da confirmação de manhã'
                                            : `${day.produtos.length} produto(s) · ${formatMoney(totalDia)}`}
                                    </span>
                                </button>

                                {isOpen && day.aguardandoConfirmacao && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 text-sm text-amber-700 dark:text-amber-400">
                                        Esse dia ainda não foi confirmado — os itens detalhados só
                                        aparecem depois que a confirmação automática de manhã rodar.
                                    </div>
                                )}

                                {isOpen && !day.aguardandoConfirmacao && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs text-zinc-500">
                                                    <th className="pb-2">Produto</th>
                                                    <th className="pb-2 text-right">
                                                        Qtd.
                                                    </th>
                                                    <th className="pb-2 text-right">
                                                        Valor
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {day.produtos.map((produto) => (
                                                    <tr
                                                        key={produto.nome}
                                                        className="border-t border-zinc-100 dark:border-zinc-800"
                                                    >
                                                        <td className="py-1.5">
                                                            {produto.nome}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {produto.quantidade}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {formatMoney(
                                                                produto.valor,
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
