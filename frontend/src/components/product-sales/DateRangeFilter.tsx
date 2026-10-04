'use client';

import { useState } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, X } from 'lucide-react';

import { hojeLocalISO, somarDias } from '@/lib/dia-filter';

// Filtro de datas compartilhado entre Dashboard/Produtos/Relatório, com
// dois modos alternáveis:
//  - "Período": intervalo livre De/Até (soma todas as importações cujo
//    período tenha alguma sobreposição com o intervalo — dá pra juntar
//    várias importações semanais num filtro só, ex: o mês inteiro).
//    Deixando os dois campos em branco, volta a somar tudo.
//  - "Dia": uma data só (atalhos Hoje/Ontem e setas ‹ ›). Por baixo é só
//    periodoInicio = periodoFim = data, então o backend não muda.
// Dia comercial = 08h até 04h do dia seguinte (mesma regra da tela Vendas
// Meep): uma venda de madrugada ainda conta pro dia anterior.
const TEXTO_DIA_COMERCIAL = 'Dia comercial: 08h–04h do dia seguinte';

function primeiroDiaDoMes() {
    return `${hojeLocalISO().slice(0, 7)}-01`;
}

export function DateRangeFilter({
    inicio,
    fim,
    onChange,
}: {
    inicio: string;
    fim: string;
    onChange: (inicio: string, fim: string) => void;
}) {
    // Já abre em "Dia" se o filtro atual for um dia único (ex: voltar de
    // outra aba com um dia escolhido).
    const [modo, setModo] = useState<'dia' | 'periodo'>(
        inicio && inicio === fim ? 'dia' : 'periodo',
    );

    const temFiltro = Boolean(inicio || fim);
    const dia = inicio && inicio === fim ? inicio : '';

    function trocarModo(novo: 'dia' | 'periodo') {
        if (novo === modo) return;
        setModo(novo);

        if (novo === 'dia') {
            // Aproveita uma data já escolhida; senão começa em hoje.
            const base = fim || inicio || hojeLocalISO();
            onChange(base, base);
        } else {
            // Volta ao padrão do Período (mês corrente acumulado) se
            // estava num dia único — não deixa "De = Até" preso.
            onChange(inicio && inicio === fim ? primeiroDiaDoMes() : inicio, inicio && inicio === fim ? '' : fim);
        }
    }

    function irPara(data: string) {
        onChange(data, data);
    }

    const botaoModo = (ativo: boolean) =>
        `rounded-lg px-2.5 py-1 text-xs font-medium transition ${ativo
            ? 'bg-blue-600 text-white'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
        }`;

    const botaoAtalho =
        'rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-1 rounded-xl bg-zinc-50 p-0.5 dark:bg-zinc-800/60">
                <button
                    type="button"
                    onClick={() => trocarModo('dia')}
                    className={botaoModo(modo === 'dia')}
                    title={TEXTO_DIA_COMERCIAL}
                >
                    Dia
                </button>
                <button
                    type="button"
                    onClick={() => trocarModo('periodo')}
                    className={botaoModo(modo === 'periodo')}
                >
                    Período
                </button>
            </div>

            {modo === 'dia' ? (
                <>
                    <CalendarDays size={16} className="shrink-0 text-zinc-400" />

                    <button
                        type="button"
                        onClick={() => irPara(somarDias(dia || hojeLocalISO(), -1))}
                        title="Dia anterior"
                        className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <input
                        type="date"
                        value={dia}
                        onChange={(e) => (e.target.value ? irPara(e.target.value) : onChange('', ''))}
                        title={TEXTO_DIA_COMERCIAL}
                        className="bg-transparent text-sm outline-none"
                    />

                    <button
                        type="button"
                        onClick={() => irPara(somarDias(dia || hojeLocalISO(), 1))}
                        title="Próximo dia"
                        className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronRight size={16} />
                    </button>

                    <button type="button" onClick={() => irPara(hojeLocalISO())} className={botaoAtalho}>
                        Hoje
                    </button>
                    <button
                        type="button"
                        onClick={() => irPara(somarDias(hojeLocalISO(), -1))}
                        className={botaoAtalho}
                    >
                        Ontem
                    </button>

                    <span className="text-xs text-zinc-400" title={TEXTO_DIA_COMERCIAL}>
                        08h–04h do dia seguinte
                    </span>
                </>
            ) : (
                <>
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
                </>
            )}

            {temFiltro && (
                <button
                    type="button"
                    onClick={() => {
                        setModo('periodo');
                        onChange('', '');
                    }}
                    title="Limpar filtro (voltar a somar tudo)"
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
