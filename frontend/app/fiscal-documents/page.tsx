'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { FileText, Receipt, Upload } from 'lucide-react';
import { toast } from 'sonner';

type FiscalDocument = {
    id: string;
    type: 'COUPON' | 'INVOICE';
    number?: string | null;
    value?: string | null;
    fileUrl?: string | null;
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    status: string;
    createdAt: string;
    store: {
        name: string;
    };
    createdBy: {
        name: string;
    };
    fiscalDocuments: FiscalDocument[];
};

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function FiscalDocumentsPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);

    async function loadPurchases() {
        try {
            setLoading(true);
            const response = await api.get('/purchases/waiting-invoices');
            setPurchases(response.data);
        } catch {
            toast.error('Erro ao carregar cupons pendentes');
        } finally {
            setLoading(false);
        }
    }

    async function addInvoice(purchaseId: string, file: File) {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('type', 'INVOICE');

        try {
            await api.post(
                `/purchases/${purchaseId}/fiscal-documents/upload`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                },
            );

            toast.success('NF vinculada com sucesso');
            await loadPurchases();
        } catch {
            toast.error('Erro ao enviar NF');
        }
    }

    useEffect(() => {
        loadPurchases();
    }, []);

    return (
        <AppLayout title="Cupons e NF">
            {loading ? (
                <p className="text-zinc-400">Carregando...</p>
            ) : purchases.length === 0 ? (
                <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                    <FileText className="mx-auto mb-3 text-zinc-500" />

                    <h2 className="text-xl font-bold">
                        Nenhum cupom pendente
                    </h2>

                    <p className="mt-2 text-zinc-400">
                        Não existem compras aguardando nota fiscal.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {purchases.map((purchase) => (
                        <div
                            key={purchase.id}
                            className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5"
                        >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div>
                                    <div className="mb-2 flex items-center gap-2">
                                        <Receipt className="text-orange-400" size={20} />

                                        <h2 className="text-xl font-bold">
                                            {purchase.description}
                                        </h2>
                                    </div>

                                    <p className="text-sm text-zinc-400">
                                        {purchase.store.name} • {purchase.createdBy.name}
                                    </p>

                                    <p className="mt-2 text-2xl font-bold text-orange-400">
                                        {formatCurrency(purchase.value)}
                                    </p>

                                    <div className="mt-4 space-y-2">
                                        {purchase.fiscalDocuments.map((doc) => (
                                            <div
                                                key={doc.id}
                                                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
                                            >
                                                <p className="text-sm text-zinc-300">
                                                    {doc.type === 'COUPON' ? 'Cupom fiscal' : 'Nota fiscal'}
                                                </p>

                                                {doc.fileUrl && (
                                                    <a
                                                        href={`${API_URL}${doc.fileUrl}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="mt-2 inline-block text-sm font-medium text-green-400 hover:text-green-300"
                                                    >
                                                        Abrir arquivo
                                                    </a>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 font-semibold text-white hover:bg-green-600">
                                    <Upload size={18} />
                                    Enviar NF

                                    <input
                                        type="file"
                                        accept="image/*,.pdf,.xml"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];

                                            if (file) {
                                                addInvoice(purchase.id, file);
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </AppLayout>
    );
}