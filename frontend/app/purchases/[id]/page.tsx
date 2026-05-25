'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppLayout } from '../../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import {
    CheckCircle2,
    Clock,
    CreditCard,
    FileText,
    ReceiptText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    paymentMethodLabel,
    purchaseStatusLabel,
} from '@/lib/purchase-labels';

type PurchaseDetail = {
    id: string;
    description: string;
    value: string;
    status: string;
    method: string;
    createdAt: string;
    notes?: string | null;
    store: { name: string };
    supplier?: { name: string } | null;
    card?: { name: string; lastDigits?: string | null } | null;
    createdBy: { name: string };
    fiscalDocuments: {
        id: string;
        type: 'COUPON' | 'INVOICE';
        fileUrl?: string | null;
        createdAt: string;
    }[];
    histories: {
        id: string;
        action: string;
        comment?: string | null;
        createdAt: string;
        user?: { name: string } | null;
    }[];
};

const historyLabel: Record<string, string> = {
    CREATED: 'Compra criada',
    APPROVED: 'Compra aprovada',
    REJECTED: 'Compra reprovada',
    COUPON_UPLOADED: 'Cupom enviado',
    INVOICE_UPLOADED: 'NF enviada',
    CHECKED: 'Compra conferida',
    CLOSED: 'Compra fechada',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function PurchaseDetailPage() {
    const params = useParams();
    const purchaseId = String(params.id);

    const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
    const [loading, setLoading] = useState(true);

    async function loadPurchase() {
        try {
            setLoading(true);
            const response = await api.get(`/purchases/${purchaseId}`);
            setPurchase(response.data);
        } catch {
            toast.error('Erro ao carregar compra');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPurchase();
    }, [purchaseId]);

    return (
        <AppLayout title="Detalhe da compra">
            {loading ? (
                <p className="text-zinc-400">Carregando...</p>
            ) : !purchase ? (
                <p className="text-zinc-400">Compra não encontrada.</p>
            ) : (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
                    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <div className="mb-5 flex items-start gap-3">
                            <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                                <ReceiptText size={24} />
                            </div>

                            <div>
                                <h2 className="text-2xl font-bold">{purchase.description}</h2>
                                <p className="mt-1 text-zinc-400">
                                    {purchase.store.name} • {purchase.createdBy.name}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">Valor</p>
                                <strong className="text-2xl text-green-400">
                                    {formatCurrency(purchase.value)}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">Status</p>
                                <strong>
                                    {purchaseStatusLabel[purchase.status] || purchase.status}
                                </strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">Fornecedor</p>
                                <strong>{purchase.supplier?.name || 'Não informado'}</strong>
                            </div>

                            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">Pagamento</p>
                                <strong>
                                    {paymentMethodLabel[purchase.method] || purchase.method}
                                </strong>
                            </div>

                            {purchase.card && (
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:col-span-2">
                                    <div className="flex items-center gap-2">
                                        <CreditCard size={18} className="text-blue-400" />
                                        <strong>
                                            {purchase.card.name}
                                            {purchase.card.lastDigits &&
                                                ` • final ${purchase.card.lastDigits}`}
                                        </strong>
                                    </div>
                                </div>
                            )}
                        </div>

                        {purchase.notes && (
                            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                                <p className="text-sm text-zinc-500">Observação</p>
                                <p className="mt-1 text-zinc-300">{purchase.notes}</p>
                            </div>
                        )}

                        <div className="mt-6">
                            <h3 className="mb-3 text-lg font-bold">Arquivos fiscais</h3>

                            {purchase.fiscalDocuments.length === 0 ? (
                                <p className="text-sm text-zinc-400">
                                    Nenhum cupom ou NF anexado.
                                </p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {purchase.fiscalDocuments.map((doc) => (
                                        <a
                                            key={doc.id}
                                            href={`${API_URL}${doc.fileUrl}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-500/20"
                                        >
                                            <FileText size={16} />
                                            Abrir {doc.type === 'COUPON' ? 'cupom' : 'NF'}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
                        <h3 className="mb-5 text-lg font-bold">Timeline</h3>

                        {purchase.histories.length === 0 ? (
                            <p className="text-sm text-zinc-400">
                                Nenhum histórico registrado.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {purchase.histories.map((history) => (
                                    <div key={history.id} className="flex gap-3">
                                        <div className="mt-1">
                                            {history.action === 'CLOSED' ||
                                                history.action === 'APPROVED' ? (
                                                <CheckCircle2 size={18} className="text-green-400" />
                                            ) : (
                                                <Clock size={18} className="text-zinc-500" />
                                            )}
                                        </div>

                                        <div>
                                            <p className="font-medium">
                                                {historyLabel[history.action] || history.action}
                                            </p>

                                            <p className="text-sm text-zinc-400">
                                                {new Date(history.createdAt).toLocaleString('pt-BR')}
                                            </p>

                                            {history.user?.name && (
                                                <p className="text-xs text-zinc-500">
                                                    Por: {history.user.name}
                                                </p>
                                            )}

                                            {history.comment && (
                                                <p className="mt-1 text-sm text-zinc-300">
                                                    {history.comment}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </aside>
                </div>
            )}
        </AppLayout>
    );
}