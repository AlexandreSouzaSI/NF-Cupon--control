'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { DateRangeFilter } from '../product-sales/DateRangeFilter';
import { SingleDayFilter } from './SingleDayFilter';

type TipoPagamento = {
    tipo: string;
    bruto: number;
    liquido: number;
    taxa: number;
    quantidade: number;
};

type Extras = {
    freelancer: number;
    descontos: number;
    outros: number;
    vale: number;
    observacao: string | null;
    sistemaCredito: number | null;
    sistemaDebito: number | null;
    sistemaPix: number | null;
    sistemaDinheiro: number | null;
    bancoCredito: number | null;
    bancoDebito: number | null;
    bancoPix: number | null;
    bancoDinheiro: number | null;
};

type DayConciliation = {
    dia: string;
    tipos: TipoPagamento[];
    totalBruto: number;
    totalLiquido: number;
    extras: Extras;
};

// Linha editável — espelha os campos manuais (Extras) mas como string,
// pra aceitar o que o usuário está digitando sem forçar conversão a
// cada tecla. sistemaX vem pré-preenchido com o valor calculado da Meep
// (buckets) quando o usuário nunca editou esse dia ainda; bancoX começa
// zerado (não existe fonte automática pra isso).
type ExtrasForm = {
    freelancer: string;
    descontos: string;
    outros: string;
    vale: string;
    observacao: string;
    sistemaCredito: string;
    sistemaDebito: string;
    sistemaPix: string;
    sistemaDinheiro: string;
    bancoCredito: string;
    bancoDebito: string;
    bancoPix: string;
    bancoDinheiro: string;
};

type Buckets = { credito: number; debito: number; pix: number; dinheiro: number };

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

function formatSignedMoney(value: number) {
    const sign = value < 0 ? '-' : value > 0 ? '+' : '';
    return `${sign}${formatMoney(Math.abs(value))}`;
}

function num(value: string) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
}

function numToInputStr(value: number) {
    return String(round2(value));
}

// A Meep manda o "tipo" de pagamento em texto livre (nome que ela mesma
// usa) — normaliza pras 4 colunas fixas da planilha de referência do
// usuário. O que não bate com nenhuma delas ainda entra no Total Venda
// (bruto real), só não aparece destacado numa coluna própria.
function bucketOf(tipo: string): 'credito' | 'debito' | 'pix' | 'dinheiro' | null {
    const t = tipo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');

    if (t.includes('pix')) return 'pix';
    if (t.includes('credito')) return 'credito';
    if (t.includes('debito')) return 'debito';
    if (t.includes('dinheiro') || t.includes('cash')) return 'dinheiro';
    return null;
}

function bucketsOf(d: DayConciliation): Buckets {
    const buckets = { credito: 0, debito: 0, pix: 0, dinheiro: 0 };
    for (const tipo of d.tipos) {
        const bucket = bucketOf(tipo.tipo);
        if (bucket) buckets[bucket] += tipo.bruto;
    }
    return buckets;
}

// Linha "editável": pré-preenchida com o valor calculado da Meep quando
// o usuário nunca corrigiu esse dia (extras.sistemaX === null) — a
// partir do primeiro Salvar, passa a usar sempre o valor digitado.
// Linha "Banco": sempre manual, começa zerada.
function extrasToForm(extras: Extras, buckets: Buckets): ExtrasForm {
    return {
        // Checagem por "!= null" (não "truthy") — um 0 que o usuário
        // realmente salvou (ex: corrigiu o Freelancer pra zero) precisa
        // continuar aparecendo como "0" depois de recarregar, não sumir
        // como se nada tivesse sido salvo.
        freelancer: extras.freelancer != null ? String(extras.freelancer) : '',
        descontos: extras.descontos != null ? String(extras.descontos) : '',
        outros: extras.outros != null ? String(extras.outros) : '',
        vale: extras.vale != null ? String(extras.vale) : '',
        observacao: extras.observacao || '',
        sistemaCredito: numToInputStr(extras.sistemaCredito ?? buckets.credito),
        sistemaDebito: numToInputStr(extras.sistemaDebito ?? buckets.debito),
        sistemaPix: numToInputStr(extras.sistemaPix ?? buckets.pix),
        sistemaDinheiro: numToInputStr(extras.sistemaDinheiro ?? buckets.dinheiro),
        bancoCredito: numToInputStr(extras.bancoCredito ?? 0),
        bancoDebito: numToInputStr(extras.bancoDebito ?? 0),
        bancoPix: numToInputStr(extras.bancoPix ?? 0),
        bancoDinheiro: numToInputStr(extras.bancoDinheiro ?? 0),
    };
}

const emptyExtras: Extras = {
    freelancer: 0,
    descontos: 0,
    outros: 0,
    vale: 0,
    observacao: null,
    sistemaCredito: null,
    sistemaDebito: null,
    sistemaPix: null,
    sistemaDinheiro: null,
    bancoCredito: null,
    bancoDebito: null,
    bancoPix: null,
    bancoDinheiro: null,
};

export function CashConciliationTab() {
    const store = getActiveStore();

    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState<DayConciliation[]>([]);

    // Grade principal: um dia comercial só (08h até 04h do dia seguinte)
    // — pedido do usuário pra bater com o horário de funcionamento do
    // bar, sem precisar escolher um intervalo De/Até toda vez.
    const [day, setDay] = useState('');

    // Período separado, só pra gerar o relatório PDF (que pode ser
    // Diário — 1 dia — ou Semanal — vários dias). Começa igual ao dia
    // selecionado na grade, mas o usuário pode ampliar pra uma semana.
    const [reportFrom, setReportFrom] = useState('');
    const [reportTo, setReportTo] = useState('');

    const [forms, setForms] = useState<Record<string, ExtrasForm>>({});
    const [savingDay, setSavingDay] = useState<string | null>(null);
    const [dirtyDays, setDirtyDays] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState(false);
    const [resyncing, setResyncing] = useState(false);

    async function load() {
        if (!store || !day) {
            setDays([]);
            setForms({});
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/meep/conciliacao-caixa', {
                params: { storeId: store.id, dateFrom: day, dateTo: day },
            });
            const data: DayConciliation[] = response.data;
            setDays(data);

            const nextForms: Record<string, ExtrasForm> = {};
            for (const d of data) {
                nextForms[d.dia] = extrasToForm(d.extras, bucketsOf(d));
            }
            // O dia escolhido precisa ficar editável mesmo sem nenhuma
            // venda Meep sincronizada ainda (ex: conciliação de cartão
            // atrasada) — senão a grade toda fica invisível justamente
            // quando o usuário mais precisa dela.
            if (!nextForms[day]) {
                nextForms[day] = extrasToForm(emptyExtras, { credito: 0, debito: 0, pix: 0, dinheiro: 0 });
            }
            setForms(nextForms);
            setDirtyDays(new Set());
        } catch {
            toast.error('Erro ao carregar a conciliação de caixa.');
        } finally {
            setLoading(false);
        }
    }

    // Força uma nova busca das vendas (pedidos + pagamento detalhado) da
    // Meep só pro dia escolhido — útil quando o usuário filtra um dia e
    // não vê os valores ainda (ex: o sync horário ainda não passou por
    // esse dia, ou falhou numa tentativa). É esse pagamento por pedido
    // que alimenta Credito/Debito/PIX/Dinheiro da grade.
    async function handleResync() {
        if (!store || !day) return;

        try {
            setResyncing(true);
            await api.post(`/meep/${store.id}/force-resync-sales`, null, {
                params: { dateFrom: day, dateTo: day },
            });
            toast.success('Vendas rebuscadas — atualizando a tela.');
            await load();
        } catch {
            toast.error('Erro ao rebuscar as vendas desse dia.');
        } finally {
            setResyncing(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day, store?.id]);

    // Conveniência: ao trocar o dia da grade, o período do relatório
    // acompanha (relatório Diário pronto sem esforço) — o usuário ainda
    // pode ampliar manualmente os campos De/Até pra gerar o Semanal.
    useEffect(() => {
        setReportFrom(day);
        setReportTo(day);
    }, [day]);

    function updateField(dia: string, field: keyof ExtrasForm, value: string) {
        setForms((current) => ({
            ...current,
            [dia]: { ...current[dia], [field]: value },
        }));
        setDirtyDays((current) => new Set(current).add(dia));
    }

    async function saveDay(dia: string) {
        if (!store) return;
        const form = forms[dia];
        if (!form) return;

        try {
            setSavingDay(dia);
            await api.put('/meep/cash-extra', {
                storeId: store.id,
                businessDay: dia,
                freelancer: num(form.freelancer),
                descontos: num(form.descontos),
                outros: num(form.outros),
                vale: num(form.vale),
                observacao: form.observacao || undefined,
                sistemaCredito: num(form.sistemaCredito),
                sistemaDebito: num(form.sistemaDebito),
                sistemaPix: num(form.sistemaPix),
                sistemaDinheiro: num(form.sistemaDinheiro),
                bancoCredito: num(form.bancoCredito),
                bancoDebito: num(form.bancoDebito),
                bancoPix: num(form.bancoPix),
                bancoDinheiro: num(form.bancoDinheiro),
            });
            toast.success(`Lançamento de ${formatDate(dia)} salvo.`);
            setDirtyDays((current) => {
                const next = new Set(current);
                next.delete(dia);
                return next;
            });
            // Recarrega do servidor depois de salvar — garante que a tela
            // mostra exatamente o que ficou gravado (e não só o que estava
            // em memória), fechando qualquer suspeita de "salvou mas não
            // substituiu o valor antigo".
            await load();
        } catch {
            toast.error('Erro ao salvar o lançamento do dia.');
        } finally {
            setSavingDay(null);
        }
    }

    async function handleDownloadPdf() {
        if (!store) return;

        try {
            setDownloading(true);
            const response = await api.get('/meep/conciliacao-caixa/report', {
                params: { storeId: store.id, dateFrom: reportFrom, dateTo: reportTo },
                responseType: 'blob',
            });
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'conciliacao-caixa.pdf';
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            toast.error('Erro ao gerar o relatório em PDF.');
        } finally {
            setDownloading(false);
        }
    }

    const rows = useMemo(() => {
        const base = days.map((d) => ({ dia: d.dia, buckets: bucketsOf(d), totalVenda: d.totalBruto }));

        // O dia escolhido sempre vira uma linha, mesmo sem nenhuma venda
        // Meep sincronizada ainda — senão a grade some justamente quando
        // falta sincronizar.
        if (day && !base.some((row) => row.dia === day)) {
            base.push({
                dia: day,
                buckets: { credito: 0, debito: 0, pix: 0, dinheiro: 0 },
                totalVenda: 0,
            });
        }

        return base;
    }, [days, day]);

    if (!store) {
        return (
            <p className="text-sm text-zinc-500">
                Selecione uma loja pra ver a conciliação de caixa.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <SingleDayFilter value={day} onChange={setDay} />

                {day && (
                    <button
                        onClick={handleResync}
                        disabled={resyncing}
                        title="Busca de novo na Meep as vendas (pedidos + pagamento) desse dia — útil quando o dia não mostra valores ainda porque o sync horário ainda não passou por aqui"
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        {resyncing ? 'Rebuscando...' : 'Rebuscar este dia'}
                    </button>
                )}
            </div>

            {loading ? (
                <p className="text-sm text-zinc-500">Carregando...</p>
            ) : !day ? (
                <p className="text-sm text-zinc-500">
                    Escolha um dia pra ver a conciliação.
                </p>
            ) : (
                <>
                    {rows.length === 1 && rows[0].totalVenda === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Nenhuma venda sincronizada nesse dia ainda — pode ser
                            que a loja não tenha vendido, ou que o sync horário
                            ainda não passou por esse dia. Tente "Rebuscar este
                            dia" acima, ou aguarde o próximo sync automático. Você
                            já pode preencher os valores abaixo mesmo assim.
                        </p>
                    )}

                    {rows.map((row) => {
                        const form = forms[row.dia] || extrasToForm(emptyExtras, row.buckets);
                        const dirty = dirtyDays.has(row.dia);

                        const sistema = {
                            credito: num(form.sistemaCredito),
                            debito: num(form.sistemaDebito),
                            pix: num(form.sistemaPix),
                            dinheiro: num(form.sistemaDinheiro),
                        };
                        const banco = {
                            credito: num(form.bancoCredito),
                            debito: num(form.bancoDebito),
                            pix: num(form.bancoPix),
                            dinheiro: num(form.bancoDinheiro),
                        };
                        const sistemaTotal = sistema.credito + sistema.debito + sistema.pix + sistema.dinheiro;
                        const bancoTotal = banco.credito + banco.debito + banco.pix + banco.dinheiro;
                        const diffTotal = bancoTotal - sistemaTotal;
                        const diffStatus =
                            Math.abs(diffTotal) < 0.01 ? 'ok' : diffTotal < 0 ? 'falta' : 'sobra';

                        const diffCells = {
                            credito: banco.credito - sistema.credito,
                            debito: banco.debito - sistema.debito,
                            pix: banco.pix - sistema.pix,
                            dinheiro: banco.dinheiro - sistema.dinheiro,
                        };

                        return (
                            <div
                                key={row.dia}
                                className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                            >
                                <p className="font-medium">{formatDate(row.dia)}</p>

                                <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                                    <table className="w-full min-w-[640px] text-sm">
                                        <thead>
                                            <tr className="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/50">
                                                <th className="px-3 py-2 font-medium">Linha</th>
                                                <th className="px-3 py-2 text-right font-medium">Credito</th>
                                                <th className="px-3 py-2 text-right font-medium">Debito</th>
                                                <th className="px-3 py-2 text-right font-medium">PIX</th>
                                                <th className="px-3 py-2 text-right font-medium">Dinheiro</th>
                                                <th className="px-3 py-2 text-right font-medium">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Sistema (Meep) — só leitura, é o valor que a Meep calculou */}
                                            <tr className="border-t border-zinc-100 dark:border-zinc-800">
                                                <td className="px-3 py-2 text-zinc-500">Sistema (Meep)</td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatMoney(row.buckets.credito)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatMoney(row.buckets.debito)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatMoney(row.buckets.pix)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatMoney(row.buckets.dinheiro)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                                                    {formatMoney(row.totalVenda)}
                                                </td>
                                            </tr>

                                            {/* Editável + Banco — mesma coluna por categoria, com o
                                                input de Editável empilhado em cima do de Banco (em
                                                vez de duas linhas separadas lado a lado). */}
                                            <tr className="border-t border-zinc-100 bg-blue-50/40 dark:border-zinc-800 dark:bg-blue-900/10">
                                                <td className="px-3 py-2 align-top font-medium text-zinc-700 dark:text-zinc-300">
                                                    <p>Editável</p>
                                                    <p className="mt-2 font-normal text-zinc-500">Banco</p>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex flex-col items-end gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.sistemaCredito}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'sistemaCredito', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.bancoCredito}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'bancoCredito', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex flex-col items-end gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.sistemaDebito}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'sistemaDebito', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.bancoDebito}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'bancoDebito', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex flex-col items-end gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.sistemaPix}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'sistemaPix', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.bancoPix}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'bancoPix', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <div className="flex flex-col items-end gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.sistemaDinheiro}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'sistemaDinheiro', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={form.bancoDinheiro}
                                                            onChange={(e) =>
                                                                updateField(row.dia, 'bancoDinheiro', e.target.value)
                                                            }
                                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-right align-top font-semibold whitespace-nowrap">
                                                    <p>{formatMoney(sistemaTotal)}</p>
                                                    <p className="mt-2 font-normal text-zinc-500">{formatMoney(bancoTotal)}</p>
                                                </td>
                                            </tr>

                                            {/* Diferença — Banco menos Editável, por coluna e total */}
                                            <tr
                                                className={`border-t border-zinc-200 font-medium dark:border-zinc-700 ${diffStatus === 'ok'
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                                    : diffStatus === 'falta'
                                                        ? 'bg-red-50 dark:bg-red-900/20'
                                                        : 'bg-amber-50 dark:bg-amber-900/20'
                                                    }`}
                                            >
                                                <td className="px-3 py-2">Diferença</td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatSignedMoney(diffCells.credito)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatSignedMoney(diffCells.debito)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatSignedMoney(diffCells.pix)}
                                                </td>
                                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                                    {formatSignedMoney(diffCells.dinheiro)}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 text-right font-bold whitespace-nowrap ${diffStatus === 'ok'
                                                        ? 'text-emerald-700 dark:text-emerald-300'
                                                        : diffStatus === 'falta'
                                                            ? 'text-red-700 dark:text-red-300'
                                                            : 'text-amber-700 dark:text-amber-300'
                                                        }`}
                                                >
                                                    {formatSignedMoney(diffTotal)}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <div
                                    className={`flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm ${diffStatus === 'ok'
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20'
                                        : diffStatus === 'falta'
                                            ? 'bg-red-50 dark:bg-red-900/20'
                                            : 'bg-amber-50 dark:bg-amber-900/20'
                                        }`}
                                >
                                    <CheckCircle2
                                        size={16}
                                        className={
                                            diffStatus === 'ok'
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : diffStatus === 'falta'
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-amber-600 dark:text-amber-400'
                                        }
                                    />
                                    <span className="font-medium">
                                        {diffStatus === 'ok'
                                            ? 'Bateu certinho'
                                            : diffStatus === 'falta'
                                                ? 'Faltou cair no banco'
                                                : 'Sobrou no banco'}
                                    </span>
                                </div>

                                <div className="flex flex-wrap items-end gap-3">
                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-500">Freelancer</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.freelancer}
                                            onChange={(e) => updateField(row.dia, 'freelancer', e.target.value)}
                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-500">Descontos</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.descontos}
                                            onChange={(e) => updateField(row.dia, 'descontos', e.target.value)}
                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-500">Outros</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.outros}
                                            onChange={(e) => updateField(row.dia, 'outros', e.target.value)}
                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-500">Vale</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={form.vale}
                                            onChange={(e) => updateField(row.dia, 'vale', e.target.value)}
                                            className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                    </div>
                                    <div className="min-w-[180px] flex-1">
                                        <label className="mb-1 block text-xs text-zinc-500">Observação</label>
                                        <input
                                            type="text"
                                            value={form.observacao}
                                            onChange={(e) => updateField(row.dia, 'observacao', e.target.value)}
                                            placeholder="Observação"
                                            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                        />
                                    </div>
                                    <button
                                        onClick={() => saveDay(row.dia)}
                                        disabled={!dirty || savingDay === row.dia}
                                        title="Salvar lançamento do dia"
                                        className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                                    >
                                        <Save size={15} />
                                        {savingDay === row.dia ? 'Salvando...' : 'Salvar'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-1 text-sm font-medium">Relatório Diário/Semanal (PDF)</p>
                <p className="mb-3 text-xs text-zinc-500">
                    Escolha um único dia pro relatório Diário, ou um período
                    (De/Até) pro Semanal — dia por dia, com Banco e
                    Diferença, e total do período.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <DateRangeFilter
                        inicio={reportFrom}
                        fim={reportTo}
                        onChange={(inicio, fim) => {
                            setReportFrom(inicio);
                            setReportTo(fim);
                        }}
                    />

                    <button
                        onClick={handleDownloadPdf}
                        disabled={downloading || (!reportFrom && !reportTo)}
                        title="Baixar relatório Diário/Semanal em PDF do período escolhido"
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        <Download size={16} />
                        {downloading ? 'Gerando...' : 'Baixar relatório (PDF)'}
                    </button>
                </div>
            </div>
        </div>
    );
}
