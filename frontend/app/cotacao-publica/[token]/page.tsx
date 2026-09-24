'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { CheckCircle2, Loader2, PackageSearch, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type UnidadeMedida = 'KG' | 'UNIDADE';

type QuotationItem = {
    id: string;
    descricao: string;
    unidadeMedida: UnidadeMedida;
    quantidadeSugerida: number;
    unitPrice: number | null;
};

type PublicQuotation = {
    supplierName: string;
    storeName: string;
    categoryName: string;
    quotationStatus: 'DRAFT' | 'SENT' | 'SUPPLIER_SELECTED' | 'ORDER_CONFIRMED' | 'CANCELED';
    aberta: boolean;
    declinedAt: string | null;
    respondedAt: string | null;
    isWinner: boolean;
    items: QuotationItem[];
};

function formatQtd(valor: number, unidade: UnidadeMedida) {
    const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return unidade === 'KG' ? `${numero} kg` : `${numero} un`;
}

export default function CotacaoPublicaPage() {
    const params = useParams();
    const token = String(params?.token || '');

    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [data, setData] = useState<PublicQuotation | null>(null);

    const [prices, setPrices] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [declining, setDeclining] = useState(false);
    // Depois que envia com sucesso, a tela troca pra "Obrigado" e para de
    // aceitar clique — evita o fornecedor mandar duas vezes sem querer.
    const [enviadoAgora, setEnviadoAgora] = useState(false);

    async function load() {
        if (!token) return;

        try {
            setLoading(true);

            const response = await api.get(`/quotations/public/${token}`);
            const quotation: PublicQuotation = response.data;

            setData(quotation);
            setPrices((current) => {
                const next = { ...current };
                for (const item of quotation.items) {
                    if (next[item.id] === undefined && item.unitPrice != null) {
                        next[item.id] = String(item.unitPrice);
                    }
                }
                return next;
            });
        } catch (error: any) {
            if (error?.response?.status === 404) {
                setNotFound(true);
            } else {
                toast.error('Erro ao carregar a cotação');
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    async function handleSubmit() {
        if (!data) return;

        const entries = data.items
            .map((item) => {
                const raw = prices[item.id];
                if (raw === undefined || raw === '') return null;

                const unitPrice = Number(raw.replace(',', '.'));
                if (Number.isNaN(unitPrice) || unitPrice < 0) return null;

                return { quotationItemId: item.id, unitPrice };
            })
            .filter((entry): entry is { quotationItemId: string; unitPrice: number } =>
                Boolean(entry),
            );

        if (entries.length === 0) {
            toast.error('Preencha o preço de pelo menos um item.');
            return;
        }

        try {
            setSubmitting(true);

            await api.post(`/quotations/public/${token}/submit`, {
                prices: entries,
            });

            toast.success('Preços enviados! Obrigado.');
            setEnviadoAgora(true);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao enviar os preços',
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDecline() {
        try {
            setDeclining(true);

            await api.post(`/quotations/public/${token}/decline`);

            toast.success('Cotação recusada.');
            await load();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao recusar a cotação',
            );
        } finally {
            setDeclining(false);
        }
    }

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950">
                <Loader2 className="animate-spin text-teal-500" size={28} />
            </div>
        );
    }

    if (notFound || !data) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center">
                <PackageSearch className="text-zinc-600" size={40} />
                <p className="text-lg font-semibold text-zinc-200">
                    Link inválido ou expirado
                </p>
                <p className="max-w-sm text-sm text-zinc-500">
                    Confira se copiou o link certo, ou peça pra quem te mandou
                    reenviar a cotação.
                </p>
            </div>
        );
    }

    if (enviadoAgora) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center">
                <CheckCircle2 className="text-teal-500" size={40} />
                <p className="text-lg font-semibold text-zinc-200">
                    Obrigado! Preços enviados.
                </p>
                <p className="max-w-sm text-sm text-zinc-500">
                    Recebemos sua cotação pra {data.categoryName} na {data.storeName}
                    . Se for o fornecedor escolhido, você recebe um novo aviso
                    pra confirmar o pedido.
                </p>
            </div>
        );
    }

    const encerrada = !data.aberta;

    return (
        <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
            <div className="mx-auto max-w-lg space-y-5">
                <div>
                    <p className="text-xs uppercase tracking-wide text-teal-500">
                        Cotação — {data.storeName}
                    </p>
                    <h1 className="text-xl font-bold">{data.categoryName}</h1>
                    <p className="mt-1 text-sm text-zinc-400">
                        Pra {data.supplierName}
                    </p>
                </div>

                {encerrada && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        {data.quotationStatus === 'CANCELED' ? (
                            <p className="text-sm text-zinc-400">
                                Essa cotação foi cancelada.
                            </p>
                        ) : data.isWinner ? (
                            <p className="flex items-center gap-2 text-sm font-semibold text-teal-400">
                                <CheckCircle2 size={16} />
                                Você foi o fornecedor escolhido! Aguarde a
                                confirmação do pedido.
                            </p>
                        ) : (
                            <p className="text-sm text-zinc-400">
                                Essa cotação já foi encerrada — não está mais
                                aceitando preços.
                            </p>
                        )}
                    </div>
                )}

                {!encerrada && data.declinedAt && (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                        Você recusou essa cotação. Se mudou de ideia, é só
                        preencher os preços abaixo e enviar.
                    </div>
                )}

                <div className="overflow-hidden rounded-2xl border border-zinc-800">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                            <tr>
                                <th className="px-3 py-2.5">Item</th>
                                <th className="px-3 py-2.5">Qtd</th>
                                <th className="px-3 py-2.5">Preço unit.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {data.items.map((item) => (
                                <tr key={item.id}>
                                    <td className="px-3 py-2.5 font-medium">
                                        {item.descricao}
                                    </td>
                                    <td className="px-3 py-2.5 text-zinc-400">
                                        {formatQtd(
                                            item.quantidadeSugerida,
                                            item.unidadeMedida,
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-zinc-500">
                                                R$
                                            </span>
                                            <input
                                                disabled={encerrada}
                                                value={prices[item.id] ?? ''}
                                                onChange={(e) =>
                                                    setPrices((current) => ({
                                                        ...current,
                                                        [item.id]: e.target.value,
                                                    }))
                                                }
                                                inputMode="decimal"
                                                placeholder="0,00"
                                                className="h-9 w-24 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-sm outline-none focus:border-teal-500 disabled:opacity-50"
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!encerrada && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={submitting}
                            onClick={handleSubmit}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-500 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50"
                        >
                            <CheckCircle2 size={16} />
                            {submitting ? 'Enviando...' : 'Enviar preços'}
                        </button>

                        {!data.declinedAt && (
                            <button
                                type="button"
                                disabled={declining}
                                onClick={handleDecline}
                                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-400 hover:bg-zinc-900 disabled:opacity-50"
                            >
                                <XCircle size={16} />
                                Recusar
                            </button>
                        )}
                    </div>
                )}

                {!encerrada && data.respondedAt && (
                    <p className="text-center text-xs text-zinc-600">
                        Você já enviou preços pra essa cotação — pode
                        atualizar e enviar de novo quando quiser, até ela ser
                        fechada.
                    </p>
                )}
            </div>
        </div>
    );
}
