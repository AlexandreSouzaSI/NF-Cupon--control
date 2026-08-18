'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    CheckCircle2,
    FileText,
    Receipt,
    Upload,
} from 'lucide-react';
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
        id: string;
        name: string;
    };
    createdBy: {
        name: string;
    };
    fiscalDocuments: FiscalDocument[];
};

const EXCLUDED_STATUSES = ['DRAFT', 'REJECTED', 'CANCELED'];

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

// A NF é o documento que realmente fecha a compra; o cupom só serve de apoio
// pra cobrar a NF do fornecedor depois. Por isso a separação usa os
// documentos já anexados (não o status da compra, que muda por outros
// motivos ao longo do fluxo).
function hasDocumentType(purchase: Purchase, type: 'COUPON' | 'INVOICE') {
    return purchase.fiscalDocuments.some((doc) => doc.type === type);
}

export default function FiscalDocumentsPage() {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'MISSING' | 'DONE'>('MISSING');

    async function loadPurchases() {
        try {
            setLoading(true);

            // Cada loja só vê as próprias compras — a loja é definida pelo
            // seletor lá em cima, não escolhida de novo aqui dentro.
            const response = await api.get('/purchases', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            const relevant = (response.data as Purchase[]).filter(
                (purchase) => !EXCLUDED_STATUSES.includes(purchase.status),
            );

            setPurchases(relevant);
        } catch {
            toast.error('Erro ao carregar compras.');
        } finally {
            setLoading(false);
        }
    }

    async function uploadDocument(
        purchaseId: string,
        file: File,
        type: 'COUPON' | 'INVOICE',
    ) {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('type', type);

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

            toast.success(
                type === 'COUPON' ? 'Cupom enviado.' : 'NF vinculada com sucesso.',
            );

            await loadPurchases();
        } catch {
            toast.error(
                type === 'COUPON' ? 'Erro ao enviar cupom.' : 'Erro ao enviar NF.',
            );
        }
    }

    useEffect(() => {
        loadPurchases();
    }, []);

    const missingInvoice = purchases.filter(
        (purchase) => !hasDocumentType(purchase, 'INVOICE'),
    );
    const withInvoice = purchases.filter((purchase) =>
        hasDocumentType(purchase, 'INVOICE'),
    );

    const visiblePurchases = activeTab === 'MISSING' ? missingInvoice : withInvoice;

    return (
        <AppLayout title="Cupons e NF">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Cupons e NF</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Toda compra precisa terminar com NF. O cupom é só um apoio
                        pra cobrar a NF do fornecedor depois.
                    </p>
                </div>

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                        onClick={() => setActiveTab('MISSING')}
                        className={`flex items-center justify-between gap-3 rounded-3xl border p-4 text-left transition ${activeTab === 'MISSING'
                            ? 'border-orange-500 bg-orange-500/10 text-orange-500'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <div>
                            <p className="text-2xl font-bold">
                                {missingInvoice.length}
                            </p>
                            <p className="text-sm">Sem NF</p>
                        </div>

                        <Receipt size={22} />
                    </button>

                    <button
                        onClick={() => setActiveTab('DONE')}
                        className={`flex items-center justify-between gap-3 rounded-3xl border p-4 text-left transition ${activeTab === 'DONE'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <div>
                            <p className="text-2xl font-bold">{withInvoice.length}</p>
                            <p className="text-sm">Com NF</p>
                        </div>

                        <CheckCircle2 size={22} />
                    </button>
                </section>

                {loading ? (
                    <p className="text-zinc-600 dark:text-zinc-400">Carregando...</p>
                ) : visiblePurchases.length === 0 ? (
                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                        <FileText className="mx-auto mb-3 text-zinc-500" />

                        <h2 className="text-xl font-bold">
                            {activeTab === 'MISSING'
                                ? 'Nenhuma compra sem NF'
                                : 'Nenhuma compra com NF ainda'}
                        </h2>

                        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                            {activeTab === 'MISSING'
                                ? 'Todas as compras já têm nota fiscal vinculada.'
                                : 'Assim que anexar uma NF, a compra aparece aqui.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {visiblePurchases.map((purchase) => {
                            const hasCoupon = hasDocumentType(purchase, 'COUPON');
                            const hasInvoice = hasDocumentType(purchase, 'INVOICE');

                            return (
                                <div
                                    key={purchase.id}
                                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <div className="mb-2 flex items-center gap-2">
                                                <Receipt
                                                    className={
                                                        hasInvoice
                                                            ? 'text-emerald-400'
                                                            : 'text-orange-400'
                                                    }
                                                    size={20}
                                                />

                                                <h2 className="text-xl font-bold">
                                                    {purchase.description}
                                                </h2>
                                            </div>

                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                {purchase.store.name} •{' '}
                                                {purchase.createdBy.name}
                                            </p>

                                            <p className="mt-2 text-2xl font-bold text-orange-400">
                                                {formatCurrency(purchase.value)}
                                            </p>

                                            {!hasInvoice && hasCoupon && (
                                                <p className="mt-2 text-sm text-yellow-500">
                                                    Cupom já enviado — falta buscar a NF
                                                    com o fornecedor.
                                                </p>
                                            )}

                                            {purchase.fiscalDocuments.length > 0 && (
                                                <div className="mt-4 space-y-2">
                                                    {purchase.fiscalDocuments.map((doc) => (
                                                        <div
                                                            key={doc.id}
                                                            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3"
                                                        >
                                                            <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                                                {doc.type === 'COUPON'
                                                                    ? 'Cupom fiscal'
                                                                    : 'Nota fiscal'}
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
                                            )}
                                        </div>

                                        {hasInvoice ? (
                                            <span className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/10 px-5 py-3 font-semibold text-emerald-400">
                                                <CheckCircle2 size={18} />
                                                NF anexada
                                            </span>
                                        ) : (
                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-5 font-semibold text-yellow-400 hover:bg-yellow-500/20">
                                                    <Upload size={18} />
                                                    Cupom

                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];

                                                            if (file) {
                                                                uploadDocument(
                                                                    purchase.id,
                                                                    file,
                                                                    'COUPON',
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </label>

                                                <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-green-500 px-5 font-semibold text-zinc-900 dark:text-white hover:bg-green-600">
                                                    <Upload size={18} />
                                                    NF

                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];

                                                            if (file) {
                                                                uploadDocument(
                                                                    purchase.id,
                                                                    file,
                                                                    'INVOICE',
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
