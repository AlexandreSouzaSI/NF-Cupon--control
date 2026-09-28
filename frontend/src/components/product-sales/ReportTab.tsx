'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BarChart3,
    ChefHat,
    PackageMinus,
    PackageSearch,
    Search,
    TrendingDown,
    TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { AutocompleteInput, type AutocompleteOption } from '../ui/AutocompleteInput';
import { DateRangeFilter } from './DateRangeFilter';
import { ColumnChart } from './charts/ColumnChart';
import { DonutChart } from './charts/DonutChart';

type StockItemOption = {
    id: string;
    nome: string;
    categoria: string | null;
    unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
};

type PratoLinha = {
    produto: string;
    quantidadeVendida: number;
    quantidadeConsumida: number;
};

type ProdutoDireto = {
    produto: string;
    quantidade: number;
    valor: number;
};

type PerdaPorDia = { data: string; quantidade: number };
type PerdaPorMotivo = { motivo: string; quantidade: number };
type PerdaRegistro = {
    id: string;
    data: string;
    quantidade: number;
    unit: string | null;
    reason: string | null;
};

type ItemReport = {
    item: {
        id: string;
        nome: string;
        categoria: string | null;
        unidadeMedida: 'KG' | 'LITRO' | 'UNIDADE';
    };
    periodo: { inicio: string | null; fim: string | null };
    vendaDireta: {
        quantidade: number;
        valor: number;
        produtos: ProdutoDireto[];
    } | null;
    vendaViaReceita: {
        quantidadeConsumida: number;
        pratos: PratoLinha[];
    } | null;
    perdas: {
        total: number;
        unidade: string | null;
        porDia: PerdaPorDia[];
        porMotivo: PerdaPorMotivo[];
        registros: PerdaRegistro[];
    };
};

const UNIDADE_LABEL: Record<string, string> = {
    KG: 'kg',
    LITRO: 'L',
    UNIDADE: 'un',
};

const CORES_MOTIVO = [
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
    '#64748b',
];

function formatNumero(value: number, casas = 2) {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: casas,
    });
}

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDiaLabel(dataIso: string) {
    // dataIso vem como "AAAA-MM-DD" (slice de toISOString) — exibe
    // dd/mm sem depender de fuso.
    const [ano, mes, dia] = dataIso.split('-');
    return `${dia}/${mes}`;
}

export function ReportTab() {
    const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
    const [stockItemId, setStockItemId] = useState('');
    const [inicio, setInicio] = useState('');
    const [fim, setFim] = useState('');

    const [report, setReport] = useState<ItemReport | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const store = getActiveStore();
        if (!store) return;

        api
            .get('/product-sales/ingredients', { params: { storeId: store.id } })
            .then((response) => setStockItems(response.data))
            .catch(() => {
                toast.error('Erro ao carregar o catálogo de itens do Estoque.');
            });
    }, []);

    const stockOptions: AutocompleteOption[] = useMemo(
        () =>
            stockItems.map((item) => ({
                id: item.id,
                nome: item.categoria ? `${item.nome} (${item.categoria})` : item.nome,
            })),
        [stockItems],
    );

    useEffect(() => {
        const store = getActiveStore();
        if (!store || !stockItemId) {
            setReport(null);
            return;
        }

        let cancelado = false;

        setLoading(true);
        api
            .get('/product-sales/item-report', {
                params: {
                    storeId: store.id,
                    stockItemId,
                    periodoInicio: inicio || undefined,
                    periodoFim: fim || undefined,
                },
            })
            .then((response) => {
                if (!cancelado) setReport(response.data);
            })
            .catch(() => {
                if (!cancelado) {
                    toast.error('Erro ao gerar o relatório do item.');
                    setReport(null);
                }
            })
            .finally(() => {
                if (!cancelado) setLoading(false);
            });

        return () => {
            cancelado = true;
        };
    }, [stockItemId, inicio, fim]);

    const unidadeLabel = report ? UNIDADE_LABEL[report.item.unidadeMedida] : '';

    const totalVendido =
        (report?.vendaDireta?.quantidade || 0) +
        (report?.vendaViaReceita?.quantidadeConsumida || 0);

    const totalPerdido = report?.perdas.total || 0;

    // Só faz sentido comparar venda x perda quando existe pelo menos um
    // dos dois lados — percentual é aproximado (as unidades registradas
    // em Perdas são texto livre, podem não bater 100% com a unidade do
    // Estoque).
    const percentualPerda =
        totalVendido + totalPerdido > 0
            ? (totalPerdido / (totalVendido + totalPerdido)) * 100
            : null;

    const perdasPorDiaChart = useMemo(
        () =>
            (report?.perdas.porDia || []).map((item) => ({
                label: formatDiaLabel(item.data),
                value: item.quantidade,
            })),
        [report],
    );

    const perdasPorMotivoDonut = useMemo(
        () =>
            (report?.perdas.porMotivo || []).map((item, index) => ({
                label: item.motivo,
                value: item.quantidade,
                cor: CORES_MOTIVO[index % CORES_MOTIVO.length],
            })),
        [report],
    );

    const pratosChart = useMemo(
        () =>
            (report?.vendaViaReceita?.pratos || [])
                .slice(0, 8)
                .map((item) => ({
                    label: item.produto,
                    value: item.quantidadeConsumida,
                })),
        [report],
    );

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <Search size={18} className="shrink-0 text-zinc-400" />

                <div className="min-w-[260px] flex-1">
                    <AutocompleteInput
                        options={stockOptions}
                        value={stockItemId}
                        onChange={setStockItemId}
                        placeholder="Digite o nome do item (ex: Ancho, Refrigerante...)"
                    />
                </div>

                <DateRangeFilter
                    inicio={inicio}
                    fim={fim}
                    onChange={(novoInicio, novoFim) => {
                        setInicio(novoInicio);
                        setFim(novoFim);
                    }}
                />
            </div>

            {!stockItemId ? (
                <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 text-center text-sm text-zinc-500 dark:border-zinc-700">
                    <PackageSearch size={28} className="text-zinc-300 dark:text-zinc-600" />
                    Digite um item acima pra ver a análise de vendas e perdas dele.
                </div>
            ) : loading ? (
                <p className="py-10 text-center text-sm text-zinc-500">
                    Calculando...
                </p>
            ) : !report ? null : (
                <>
                    <div>
                        <h3 className="text-xl font-bold">{report.item.nome}</h3>
                        <p className="text-sm text-zinc-500">
                            {report.item.categoria || 'Sem categoria'} · unidade
                            de estoque: {unidadeLabel}
                            {report.periodo.inicio || report.periodo.fim
                                ? ` · período filtrado`
                                : ' · todo o histórico importado'}
                        </p>
                    </div>

                    {!report.vendaDireta && !report.vendaViaReceita && (
                        <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                            Não encontrei venda desse item no período — nem como
                            produto vendido direto, nem como ingrediente de
                            ficha técnica. Confira se o nome bate com o que sai
                            na planilha do PDV.
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {report.vendaDireta && (
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    <TrendingUp size={14} />
                                    Vendido direto
                                </div>
                                <strong className="text-2xl">
                                    {formatNumero(report.vendaDireta.quantidade)}
                                </strong>
                                <p className="text-xs text-zinc-500">
                                    {formatCurrency(report.vendaDireta.valor)} em
                                    vendas
                                </p>
                            </div>
                        )}

                        {report.vendaViaReceita && (
                            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                                    <ChefHat size={14} />
                                    Consumido em pratos
                                </div>
                                <strong className="text-2xl">
                                    {formatNumero(
                                        report.vendaViaReceita.quantidadeConsumida,
                                    )}{' '}
                                    <span className="text-base font-normal text-zinc-400">
                                        {unidadeLabel}
                                    </span>
                                </strong>
                                <p className="text-xs text-zinc-500">
                                    em {report.vendaViaReceita.pratos.length}{' '}
                                    prato(s) diferente(s)
                                </p>
                            </div>
                        )}

                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
                                <TrendingDown size={14} />
                                Total perdido
                            </div>
                            <strong className="text-2xl">
                                {formatNumero(totalPerdido)}{' '}
                                <span className="text-base font-normal text-zinc-400">
                                    {report.perdas.unidade || ''}
                                </span>
                            </strong>
                            <p className="text-xs text-zinc-500">
                                {report.perdas.registros.length} registro(s) de
                                perda
                            </p>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-zinc-500">
                                <PackageMinus size={14} />
                                % perdido (aprox.)
                            </div>
                            <strong className="text-2xl">
                                {percentualPerda == null
                                    ? '—'
                                    : `${formatNumero(percentualPerda, 1)}%`}
                            </strong>
                            <p className="text-xs text-zinc-500">
                                em relação ao total vendido + perdido
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                        <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <BarChart3 size={18} className="text-red-500" />
                                <h4 className="text-sm font-semibold">
                                    Perdas por dia, no período
                                </h4>
                            </div>
                            <ColumnChart
                                itens={perdasPorDiaChart}
                                corDe="#f87171"
                                corPara="#dc2626"
                                formatarValor={(v) =>
                                    `${formatNumero(v)}${report.perdas.unidade ? ` ${report.perdas.unidade}` : ''}`
                                }
                                ordem="asc"
                            />
                        </div>

                        <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <AlertTriangle size={18} className="text-amber-500" />
                                <h4 className="text-sm font-semibold">
                                    Perdas por motivo
                                </h4>
                            </div>

                            {perdasPorMotivoDonut.length === 0 ? (
                                <p className="flex h-40 items-center justify-center text-sm text-zinc-400">
                                    Nenhuma perda registrada nesse período.
                                </p>
                            ) : (
                                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                                    <DonutChart
                                        itens={perdasPorMotivoDonut}
                                        centro={{
                                            titulo: 'Total',
                                            valor: formatNumero(totalPerdido),
                                        }}
                                    />
                                    <ul className="w-full space-y-2">
                                        {perdasPorMotivoDonut.map((item) => (
                                            <li
                                                key={item.label}
                                                className="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span className="flex items-center gap-2 truncate">
                                                    <span
                                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                                        style={{ background: item.cor }}
                                                    />
                                                    {item.label}
                                                </span>
                                                <span className="shrink-0 font-semibold">
                                                    {formatNumero(item.value)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>

                    {report.vendaViaReceita && (
                        <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <ChefHat size={18} className="text-blue-500" />
                                <h4 className="text-sm font-semibold">
                                    Pratos que saíram usando esse item
                                </h4>
                            </div>

                            <ColumnChart
                                itens={pratosChart}
                                corDe="#60a5fa"
                                corPara="#2563eb"
                                formatarValor={(v) =>
                                    `${formatNumero(v)} ${unidadeLabel}`
                                }
                            />

                            <div className="mt-4 overflow-x-auto border-t border-zinc-200 pt-4 dark:border-zinc-800">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-zinc-500">
                                            <th className="pb-2">Prato</th>
                                            <th className="pb-2 text-right">
                                                Vendas do prato
                                            </th>
                                            <th className="pb-2 text-right">
                                                {report.item.nome} consumido
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.vendaViaReceita.pratos.map((prato) => (
                                            <tr
                                                key={prato.produto}
                                                className="border-t border-zinc-100 dark:border-zinc-800"
                                            >
                                                <td className="py-2 pr-4">
                                                    {prato.produto}
                                                </td>
                                                <td className="py-2 pr-4 text-right">
                                                    {formatNumero(
                                                        prato.quantidadeVendida,
                                                        0,
                                                    )}
                                                </td>
                                                <td className="py-2 text-right font-semibold">
                                                    {formatNumero(
                                                        prato.quantidadeConsumida,
                                                    )}{' '}
                                                    {unidadeLabel}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {report.vendaDireta && report.vendaDireta.produtos.length > 1 && (
                        <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <TrendingUp size={18} className="text-emerald-500" />
                                <h4 className="text-sm font-semibold">
                                    Variações vendidas diretamente
                                </h4>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-zinc-500">
                                            <th className="pb-2">Produto</th>
                                            <th className="pb-2 text-right">
                                                Quantidade
                                            </th>
                                            <th className="pb-2 text-right">
                                                Faturamento
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.vendaDireta.produtos.map((produto) => (
                                            <tr
                                                key={produto.produto}
                                                className="border-t border-zinc-100 dark:border-zinc-800"
                                            >
                                                <td className="py-2 pr-4">
                                                    {produto.produto}
                                                </td>
                                                <td className="py-2 pr-4 text-right">
                                                    {formatNumero(produto.quantidade, 0)}
                                                </td>
                                                <td className="py-2 text-right font-semibold">
                                                    {formatCurrency(produto.valor)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {report.perdas.registros.length > 0 && (
                        <div className="rounded-3xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="mb-4 flex items-center gap-2">
                                <PackageMinus size={18} className="text-red-500" />
                                <h4 className="text-sm font-semibold">
                                    Registros de perda no período
                                </h4>
                            </div>
                            <div className="max-h-80 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                                        <tr className="text-left text-xs text-zinc-500">
                                            <th className="pb-2">Data</th>
                                            <th className="pb-2 text-right">
                                                Quantidade
                                            </th>
                                            <th className="pb-2">Motivo</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.perdas.registros.map((registro) => (
                                            <tr
                                                key={registro.id}
                                                className="border-t border-zinc-100 dark:border-zinc-800"
                                            >
                                                <td className="py-2 pr-4">
                                                    {new Date(
                                                        registro.data,
                                                    ).toLocaleDateString('pt-BR', {
                                                        timeZone: 'UTC',
                                                    })}
                                                </td>
                                                <td className="py-2 pr-4 text-right">
                                                    {formatNumero(registro.quantidade)}{' '}
                                                    {registro.unit || ''}
                                                </td>
                                                <td className="py-2 text-zinc-500">
                                                    {registro.reason || '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
