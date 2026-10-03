'use client';

import { CalendarDays, X } from 'lucide-react';

// Filtro de UM dia comercial só — usado nas telas de Vendas Meep (Itens
// por Dia, Vendas e Impostos, Conciliação de Caixa). "Dia comercial" é
// 08h de um dia até 04h do dia seguinte (horário de Brasília): o bar
// não fecha na virada do dia, então escolher "27" já traz tudo que
// entrou das 08h do 27 até as 04h do 28 — sem precisar escolher um
// intervalo De/Até pra isso (ver business-day.util.ts no backend).
export function SingleDayFilter({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <CalendarDays size={16} className="shrink-0 text-zinc-400" />

            <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                title="Dia comercial (08h até 04h do dia seguinte)"
                className="bg-transparent text-sm outline-none"
            />

            <span
                className="text-xs text-zinc-400"
                title="Bate com o horário de funcionamento: uma venda feita de madrugada ainda conta pro dia anterior."
            >
                08h – 04h do dia seguinte
            </span>

            {value && (
                <button
                    onClick={() => onChange('')}
                    title="Limpar filtro (voltar a somar os últimos 30 dias)"
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
