'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    CheckCircle2,
    FileSearch,
    FileText,
    Loader2,
    Receipt,
    RefreshCw,
    Upload,
    X,
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

type IncomingGoodsNf = {
    id: string;
    chaveAcesso: string;
    issuerCnpj?: string | null;
    issuerName?: string | null;
    value?: string | null;
    issueDate?: string | null;
    situacao?: string | null;
    fileUrl?: string | null;
    fetchedAt: string;
};

const EXCLUDED_STATUSES = ['DRAFT', 'REJECTED', 'CANCELED'];

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) return 'Data não informada';
    return new Date(value).toLocaleDateString('pt-BR');
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
    const [activeTab, setActiveTab] = useState<'MISSING' | 'DONE' | 'PENDING'>(
        'MISSING',
    );

    const [incomingNfs, setIncomingNfs] = useState<IncomingGoodsNf[]>([]);
    const [loadingIncoming, setLoadingIncoming] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [selectedPurchaseId, setSelectedPurchaseId] = useState<
        Record<string, string>
    >({});
    const [busyId, setBusyId] = useState<string | null>(null);

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

    async function loadIncomingNfs() {
        try {
            setLoadingIncoming(true);

            const response = await api.get('/purchases/incoming-goods-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setIncomingNfs(response.data);
        } catch {
            toast.error('Erro ao carregar NFs pendentes.');
        } finally {
            setLoadingIncoming(false);
        }
    }

    async function handleSync() {
        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setSyncing(true);

            const response = await api.post('/purchases/incoming-goods-nf/sync', {
                storeId: store.id,
            });

            const result = response.data as { resumoCount: number };

            toast.success(
                result.resumoCount > 0
                    ? `${result.resumoCount} NF(s) nova(s) encontrada(s).`
                    : 'Busca concluída — nenhuma NF nova na Sefaz.',
            );

            await loadIncomingNfs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao buscar NFs na Sefaz.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSyncing(false);
        }
    }

    async function handleLink(incomingId: string) {
        const purchaseId = selectedPurchaseId[incomingId];

        if (!purchaseId) {
            toast.error('Selecione a compra correspondente.');
            return;
        }

        try {
            setBusyId(incomingId);

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/link`, {
                purchaseId,
            });

            toast.success('NF vinculada à compra.');
            setLinkingId(null);
            await Promise.all([loadIncomingNfs(), loadPurchases()]);
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao vincular a NF.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setBusyId(null);
        }
    }

    async function handleIgnore(incomingId: string) {
        const confirmed = confirm('Marcar essa NF como "não é nossa"?');
        if (!confirmed) return;

        try {
            setBusyId(incomingId);

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/ignore`);

            toast.success('NF ignorada.');
            await loadIncomingNfs();
        } catch {
            toast.error('Erro ao ignorar a NF.');
        } finally {
            setBusyId(null);
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
        loadIncomingNfs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                        Toda compra precisa terminar com NF. O cupom só serve de apoio
                        pra cobrar a NF do fornecedor depois.
                    </p>
                </div>

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

                    <button
                        onClick={() => setActiveTab('PENDING')}
                        className={`flex items-center justify-between gap-3 rounded-3xl border p-4 text-left transition ${activeTab === 'PENDING'
                            ? 'border-purple-500 bg-purple-500/10 text-purple-500'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                    >
                        <div>
                            <p className="text-2xl font-bold">{incomingNfs.length}</p>
                            <p className="text-sm">Novas NFs</p>
                        </div>

                        <FileSearch size={22} />
                    </button>
                </section>

                {activeTab === 'PENDING' ? (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="font-semibold">
                                    NF-e recebidas automaticamente da Sefaz
                                </h3>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Confirme se cada NF corresponde a uma compra já
                                    cadastrada. Se não for sua, marque como ignorada.
                                </p>
                            </div>

                            <button
                                disabled={syncing}
                                onClick={handleSync}
                                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-purple-500 px-4 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                            >
                                {syncing ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <RefreshCw size={16} />
                                )}
                                {syncing ? 'Buscando...' : 'Buscar novas NFs'}
                            </button>
                        </div>

                        {loadingIncoming ? (
                            <p className="text-zinc-600 dark:text-zinc-400">
                                Carregando...
                            </p>
                        ) : incomingNfs.length === 0 ? (
                            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                                <FileSearch className="mx-auto mb-3 text-zinc-500" />
                                <h2 className="text-xl font-bold">
                                    Nenhuma NF pendente
                                </h2>
                                <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                                    Clique em &quot;Buscar novas NFs&quot; pra consultar a
                                    Sefaz, ou aguarde a próxima NF chegar.
                                </p>
                            </div>
                        ) : (
                            incomingNfs.map((nf) => (
                                <div
                                    key={nf.id}
                                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-lg font-bold">
                                                {nf.issuerName || 'Fornecedor não identificado'}
                                            </p>
                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                CNPJ: {nf.issuerCnpj || 'Não informado'} •{' '}
                                                {formatDate(nf.issueDate)}
                                                {nf.situacao ? ` • ${nf.situacao}` : ''}
                                            </p>
                                            <p className="mt-2 text-2xl font-bold text-purple-400">
                                                {formatCurrency(nf.value)}
                                            </p>
                                            <p className="mt-2 break-all text-xs text-zinc-500">
                                                Chave: {nf.chaveAcesso}
                                            </p>

                                            {nf.fileUrl && (
                                                <a
                                                    href={`${API_URL}${nf.fileUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-2 inline-block text-sm font-medium text-purple-400 hover:text-purple-300"
                                                >
                                                    Abrir XML
                                                </a>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2 sm:min-w-[260px]">
                                            {linkingId === nf.id ? (
                                                <>
                                                    <select
                                                        value={
                                                            selectedPurchaseId[nf.id] || ''
                                                        }
                                                        onChange={(e) =>
                                                            setSelectedPurchaseId({
                                                                ...selectedPurchaseId,
                                                                [nf.id]: e.target.value,
                                                            })
                                                        }
                                                        className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-purple-500"
                                                    >
                                                        <option value="">
                                                            Selecione a compra...
                                                        </option>
                                                        {purchases.map((purchase) => (
                                                            <option
                                                                key={purchase.id}
                                                                value={purchase.id}
                                                            >
                                                                {purchase.description} —{' '}
                                                                {formatCurrency(purchase.value)}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <div className="flex gap-2">
                                                        <button
                                                            disabled={busyId === nf.id}
                                                            onClick={() => handleLink(nf.id)}
                                                            className="h-10 flex-1 rounded-xl bg-purple-500 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
                                                        >
                                                            {busyId === nf.id
                                                                ? 'Vinculando...'
                                                                : 'Confirmar vínculo'}
                                                        </button>

                                                        <button
                                                            onClick={() => setLinkingId(null)}
                                                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => setLinkingId(nf.id)}
                                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                                                    >
                                                        <CheckCircle2 size={16} />
                                                        Essa compra existiu
                                                    </button>

                                                    <button
                                                        disabled={busyId === nf.id}
                                                        onClick={() => handleIgnore(nf.id)}
                                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                                    >
                                                        Não é nossa
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : loading ? (
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
