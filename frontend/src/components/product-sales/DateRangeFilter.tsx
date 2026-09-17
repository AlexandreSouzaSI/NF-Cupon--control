'use client';

import { CalendarRange, X } from 'lucide-react';

// Filtro de intervalo de datas livre, compartilhado entre
// Dashboard/Produtos/Ingredientes: soma todas as importações cujo
// período tenha alguma sobreposição com o intervalo escolhido — dá pra
// juntar várias importações semanais num filtro só (ex: o mês inteiro).
// Deixando os dois campos em branco, volta a somar tudo.
export function DateRangeFilter({
    inicio,
    fim,
    onChange,
}: {
    inicio: string;
    fim: string;
    onChange: (inicio: string, fim: string) => void;
}) {
    const temFiltro = Boolean(inicio || fim);

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <CalendarRange size={16} className="shrink-0 text-zinc-400" />

            <input
                type="date"
                value={inicio}
                onChange={(e) => onChange(e.target.value, fim)}
                title="De"
                className="bg-transparent text-sm outline-none"
            />

            <span className="text-xs text-zinc-400">até</span>

            <input
                type="date"
                value={fim}
                onChange={(e) => onChange(inicio, e.target.value)}
                title="Até"
                className="bg-transparent text-sm outline-none"
            />

            {temFiltro && (
                <button
                    onClick={() => onChange('', '')}
                    title="Limpar filtro (voltar a somar tudo)"
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
