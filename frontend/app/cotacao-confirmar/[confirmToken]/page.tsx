'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { CheckCircle2, Download, Loader2, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';

type UnidadeMedida = 'KG' | 'UNIDADE';

type ConfirmItem = {
    id: string;
    descricao: string;
    unidadeMedida: UnidadeMedida;
    quantidadeSugerida: number;
    unitPrice: number | null;
};

type OrderConfirmation = {
    supplierName: string;
    storeName: string;
    categoryName: string;
    quotationStatus: string;
    isWinner: boolean;
    jaConfirmado: boolean;
    podeConfirmar: boolean;
    total: number;
    items: ConfirmItem[];
    storeCnpj: string | null;
    storeInscricaoEstadual: string | null;
    storeEndereco: string | null;
};

function formatQtd(valor: number, unidade: UnidadeMedida) {
    const numero = valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    return unidade === 'KG' ? `${numero} kg` : `${numero} un`;
}

function formatMoney(valor: number) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function CotacaoConfirmarPage() {
    const params = useParams();
    const confirmToken = String(params?.confirmToken || '');

    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [data, setData] = useState<OrderConfirmation | null>(null);
    const [confirming, setConfirming] = useState(false);

    async function load() {
        if (!confirmToken) return;

        try {
            setLoading(true);

            const response = await api.get(
                `/quotations/public/confirm/${confirmToken}`,
            );
            setData(response.data);
        } catch (error: any) {
            if (error?.response?.status === 404) {
                setNotFound(true);
            } else {
                toast.error('Erro ao carregar o pedido');
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [confirmToken]);

    async function handleConfirm() {
        try {
            setConfirming(true);

            await api.post(`/quotations/public/confirm/${confirmToken}`);

            toast.success('Pedido confirmado!');
            await load();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Erro ao confirmar o pedido',
            );
        } finally {
            setConfirming(false);
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
                    reenviar a confirmação.
                </p>
            </div>
        );
    }

    const jaConfirmado = data.jaConfirmado;

    return (
        <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100 print:bg-white print:px-0 print:py-0 print:text-black">
            <div className="mx-auto max-w-lg space-y-5">
                <div>
                    <p className="text-xs uppercase tracking-wide text-teal-500">
                        Confirmação de pedido — {data.storeName}
                    </p>
                    <h1 className="text-xl font-bold">{data.categoryName}</h1>
                    <p className="mt-1 text-sm text-zinc-400">
                        Pra {data.supplierName}
                    </p>
                </div>

                {jaConfirmado ? (
                    <div className="space-y-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 print:border-zinc-300 print:bg-white">
                        <p className="flex items-center gap-2 text-sm font-semibold text-green-400 print:text-black">
                            <CheckCircle2 size={16} />
                            Pedido já confirmado. Obrigado!
                        </p>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-4 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 print:hidden"
                        >
                            <Download size={16} />
                            Salvar em PDF
                        </button>
                    </div>
                ) : !data.podeConfirmar ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                        <p className="text-sm text-zinc-400">
                            {data.isWinner
                                ? 'Esse pedido não está mais aguardando confirmação.'
                                : 'Você não foi o fornecedor escolhido nessa cotação.'}
                        </p>
                    </div>
                ) : null}

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
                                    <td className="px-3 py-2.5 text-zinc-400">
                                        {item.unitPrice != null
                                            ? formatMoney(item.unitPrice)
                                            : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-zinc-800 bg-zinc-900">
                                <td className="px-3 py-2.5 font-semibold" colSpan={2}>
                                    Total do pedido
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-teal-400">
                                    {formatMoney(data.total)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {data.podeConfirmar && !jaConfirmado && (
                    <button
                        type="button"
                        disabled={confirming}
                        onClick={handleConfirm}
                        className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-teal-500 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-50 print:hidden"
                    >
                        <CheckCircle2 size={16} />
                        {confirming ? 'Confirmando...' : 'Confirmar pedido'}
                    </button>
                )}

                {jaConfirmado && (
                    <div className="mt-10 flex items-center gap-3 border-t border-zinc-800 pt-4 print:border-zinc-300">
                        <img
                            src="/icons/logo-nugalho.jpeg"
                            alt="NuGalho"
                            className="h-10 w-10 shrink-0 rounded-md object-contain"
                        />
                        <div className="text-xs leading-relaxed text-zinc-500 print:text-black">
                            <p className="font-semibold text-zinc-300 print:text-black">
                                {data.storeName}
                            </p>
                            {data.storeCnpj && <p>CNPJ: {data.storeCnpj}</p>}
                            {data.storeInscricaoEstadual && (
                                <p>IE: {data.storeInscricaoEstadual}</p>
                            )}
                            {data.storeEndereco && <p>{data.storeEndereco}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
