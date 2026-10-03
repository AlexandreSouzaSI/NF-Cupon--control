'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { SingleDayFilter } from './SingleDayFilter';

type SaleItem = {
    nome: string;
    quantidade: number;
    valorUnitario: number;
    total: number | null;
    cfop: string | null;
    ncm: string | null;
};

type SalePayment = {
    tipo: string | null;
    valor: number;
    bandeira: string | null;
};

type Sale = {
    id: string;
    meepOrderId: string;
    data: string;
    status: string | null;
    valor: number;
    tipoPagamento: number | null;
    pagamentos: SalePayment[];
    itens: SaleItem[];
};

// order.paymentType vem como código numérico direto do GetSimpleSales
// (a Meep não documenta o enum) — quando não veio nenhum pagamento
// detalhado (order.payments vazio), mostramos esse código como
// fallback pra pelo menos indicar que tem informação de pagamento.
function formatPaymentSummary(sale: Sale) {
    if (sale.pagamentos.length > 0) {
        return sale.pagamentos
            .map((p) => {
                const tipo = p.tipo || 'pagamento';
                const bandeira = p.bandeira ? ` (${p.bandeira})` : '';
                return `${tipo}${bandeira}: ${formatMoney(Number(p.valor))}`;
            })
            .join(' + ');
    }

    if (sale.tipoPagamento !== null && sale.tipoPagamento !== undefined) {
        return `tipo ${sale.tipoPagamento} (sem detalhamento)`;
    }

    return null;
}

function formatDateTime(value: string) {
    // Fuso explícito — sem isso, o navegador pode exibir o horário UTC
    // cru (dependendo do fuso do SO/navegador) em vez de converter pra
    // Brasília, o que faz uma venda das 20h aparecer como se fosse 23h.
    return new Date(value).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatMoney(value: number) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function TaxSalesTab() {
    const store = getActiveStore();

    const [loading, setLoading] = useState(true);
    const [sales, setSales] = useState<Sale[]>([]);
    const [openSaleId, setOpenSaleId] = useState<string | null>(null);
    const [day, setDay] = useState('');

    async function load() {
        if (!store) return;

        try {
            setLoading(true);
            const response = await api.get('/meep/vendas-impostos', {
                params: { storeId: store.id, dateFrom: day, dateTo: day },
            });
            setSales(response.data);
        } catch {
            toast.error('Erro ao carregar as vendas com CFOP/NCM.');
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
                Selecione uma loja pra ver as vendas com impostos.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <SingleDayFilter value={day} onChange={setDay} />

            <p className="text-xs text-zinc-500">
                CFOP/NCM só aparece nas vendas já sincronizadas pela rota que
                traz esse detalhe (roda sozinha entre 4h e 14h, respeitando a
                restrição da Meep). Vendas mais recentes podem aparecer sem
                esse dado até a próxima sincronização.
            </p>

            {loading ? (
                <p className="text-sm text-zinc-500">Carregando...</p>
            ) : sales.length === 0 ? (
                <p className="text-sm text-zinc-500">
                    Nenhuma venda sincronizada nesse período ainda.
                </p>
            ) : (
                <div className="space-y-2">
                    {sales.map((sale) => {
                        const isOpen = openSaleId === sale.id;
                        const paymentSummary = formatPaymentSummary(sale);

                        return (
                            <div
                                key={sale.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
                            >
                                <button
                                    onClick={() =>
                                        setOpenSaleId(isOpen ? null : sale.id)
                                    }
                                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                                >
                                    <span className="text-sm">
                                        {formatDateTime(sale.data)} ·{' '}
                                        {sale.status || 'sem status'}
                                        {paymentSummary && (
                                            <span className="text-zinc-500">
                                                {' '}
                                                · {paymentSummary}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-sm font-semibold">
                                        {formatMoney(Number(sale.valor))}
                                    </span>
                                </button>

                                {isOpen && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-xs text-zinc-500">
                                                    <th className="pb-2">Item</th>
                                                    <th className="pb-2 text-right">
                                                        Qtd.
                                                    </th>
                                                    <th className="pb-2 text-right">
                                                        Total
                                                    </th>
                                                    <th className="pb-2 text-right">
                                                        CFOP
                                                    </th>
                                                    <th className="pb-2 text-right">
                                                        NCM
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sale.itens.map((item, idx) => (
                                                    <tr
                                                        key={idx}
                                                        className="border-t border-zinc-100 dark:border-zinc-800"
                                                    >
                                                        <td className="py-1.5">
                                                            {item.nome}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {item.quantidade}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {formatMoney(
                                                                Number(
                                                                    item.total ??
                                                                    item.valorUnitario,
                                                                ),
                                                            )}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {item.cfop || '—'}
                                                        </td>
                                                        <td className="py-1.5 text-right">
                                                            {item.ncm || '—'}
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
