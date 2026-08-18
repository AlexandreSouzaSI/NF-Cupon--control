'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    CreditCard,
    FileText,
    LayoutGrid,
    PackageCheck,
    Plus,
    ReceiptText,
    Truck,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type Store = {
    id: string;
    name: string;
};

type Supplier = {
    id: string;
    name: string;
};

type FiscalDocument = {
    id: string;
    type: 'COUPON' | 'INVOICE';
    fileUrl?: string | null;
};

type Receipt = {
    id: string;
    status: 'OK' | 'MISSING_ITEMS' | 'EXTRA_ITEMS' | 'PARTIAL';
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    method: string;
    status: string;
    category: string;
    createdAt: string;
    store: Store;
    supplier?: Supplier | null;
    card?: {
        id: string;
        name: string;
        lastDigits?: string | null;
    } | null;
    createdBy: {
        id: string;
        name: string;
    };
    fiscalDocuments?: FiscalDocument[];
    receipts?: Receipt[];
};

// A compra passa por vários status (aprovação, recebimento, fiscal...) e o
// mesmo campo `status` é reaproveitado nas etapas seguintes — por isso, pra
// separar visualmente "vai chegar" x "chegou" x "chegou com diferença", a
// gente olha o recebimento real (receipts) e não só o status atual.
type FlowStage = 'ARRIVING' | 'OK' | 'DIFFERENCE' | 'OTHER';

const RECEIVED_STATUSES = [
    'RECEIVED_OK',
    'WAITING_INVOICE',
    'HAS_COUPON_ONLY',
    'HAS_INVOICE',
    'WAITING_PAYMENT_REGISTER',
    'CLOSED',
];

function getFlowStage(purchase: Purchase): FlowStage {
    if (['REJECTED', 'CANCELED', 'DRAFT'].includes(purchase.status)) {
        return 'OTHER';
    }

    const hasDivergentReceipt = purchase.receipts?.some(
        (receipt) => receipt.status !== 'OK',
    );

    if (hasDivergentReceipt || purchase.status === 'RECEIVED_WITH_DIFFERENCE') {
        return 'DIFFERENCE';
    }

    const hasAnyReceipt = (purchase.receipts?.length || 0) > 0;

    if (hasAnyReceipt || RECEIVED_STATUSES.includes(purchase.status)) {
        return 'OK';
    }

    return 'ARRIVING';
}

const flowTabs: {
    key: FlowStage | 'ALL';
    label: string;
    icon: typeof Truck;
    activeClass: string;
}[] = [
    {
        key: 'ARRIVING',
        label: 'A chegar',
        icon: Truck,
        activeClass: 'border-amber-500 bg-amber-500/10 text-amber-500',
    },
    {
        key: 'OK',
        label: 'Chegou',
        icon: CheckCircle2,
        activeClass: 'border-emerald-500 bg-emerald-500/10 text-emerald-500',
    },
    {
        key: 'DIFFERENCE',
        label: 'Chegou com diferença',
        icon: AlertTriangle,
        activeClass: 'border-red-500 bg-red-500/10 text-red-500',
    },
    {
        key: 'ALL',
        label: 'Todas',
        icon: LayoutGrid,
        activeClass: 'border-zinc-500 bg-zinc-500/10 text-zinc-500',
    },
];

const statusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida OK',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com diferença',
    WAITING_INVOICE: 'Aguardando NF',
    HAS_COUPON_ONLY: 'Apenas com cupom',
    HAS_INVOICE: 'Com NF',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

const statusColor: Record<string, string> = {
    DRAFT: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    WAITING_APPROVAL: 'bg-yellow-500/10 text-yellow-400',
    APPROVED: 'bg-blue-500/10 text-blue-400',
    REJECTED: 'bg-red-500/10 text-red-400',
    WAITING_RECEIPT: 'bg-orange-500/10 text-orange-400',
    RECEIVED_OK: 'bg-green-500/10 text-green-400',
    RECEIVED_WITH_DIFFERENCE: 'bg-red-500/10 text-red-400',
    WAITING_INVOICE: 'bg-orange-500/10 text-orange-400',
    HAS_COUPON_ONLY: 'bg-yellow-500/10 text-yellow-400',
    HAS_INVOICE: 'bg-purple-500/10 text-purple-400',
    WAITING_PAYMENT_REGISTER: 'bg-cyan-500/10 text-cyan-400',
    CLOSED: 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200',
    CANCELED: 'bg-red-500/10 text-red-400',
};

const categoryLabel: Record<string, string> = {
    SUPPLIER_ORDER: 'Pedido com fornecedor',
    AVULSA_CARD: 'Compra avulsa',
    ONLINE_MARKETPLACE: 'Compra online',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export default function PurchasesPage() {
    const router = useRouter();

    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<FlowStage | 'ALL'>('ARRIVING');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');

    async function loadPurchases() {
        try {
            setLoading(true);

            // A loja é a que está ativa lá em cima — cada loja só vê as
            // próprias compras aqui.
            const response = await api.get('/purchases', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    supplierId: supplierFilter || undefined,
                    category: categoryFilter || undefined,
                },
            });

            setPurchases(response.data);
        } catch {
            toast.error('Erro ao carregar compras.');
        } finally {
            setLoading(false);
        }
    }

    async function loadBaseData() {
        try {
            const response = await api.get('/suppliers');
            setSuppliers(response.data);
        } catch {
            toast.error('Erro ao carregar filtros.');
        }
    }

    async function approvePurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/approve`, {
                comment: 'Aprovada pela tela de compras.',
            });

            toast.success('Compra aprovada.');
            await loadPurchases();
        } catch {
            toast.error('Erro ao aprovar compra.');
        }
    }

    async function rejectPurchase(id: string) {
        const comment = prompt('Informe o motivo da reprovação:');

        if (!comment) return;

        try {
            await api.post(`/purchases/${id}/reject`, {
                comment,
            });

            toast.success('Compra reprovada.');
            await loadPurchases();
        } catch {
            toast.error('Erro ao reprovar compra.');
        }
    }

    async function closePurchase(id: string) {
        try {
            await api.post(`/purchases/${id}/close`);

            toast.success('Compra fechada.');
            await loadPurchases();
        } catch {
            toast.error('Erro ao fechar compra.');
        }
    }

    async function uploadFiscalDocument(
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

            toast.success(type === 'COUPON' ? 'Cupom enviado.' : 'NF enviada.');
            await loadPurchases();
        } catch {
            toast.error('Erro ao enviar arquivo fiscal.');
        }
    }

    useEffect(() => {
        loadBaseData();
    }, []);

    useEffect(() => {
        loadPurchases();
    }, [supplierFilter, categoryFilter]);

    const stageCounts = purchases.reduce<Record<string, number>>(
        (acc, purchase) => {
            const stage = getFlowStage(purchase);
            acc[stage] = (acc[stage] || 0) + 1;
            return acc;
        },
        {},
    );

    const visiblePurchases =
        activeTab === 'ALL'
            ? purchases
            : purchases.filter((purchase) => getFlowStage(purchase) === activeTab);

    return (
        <AppLayout title="Compras">
            <div className="space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">Compras</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Acompanhe aprovação, recebimento, cupom, NF e fechamento.
                        </p>
                    </div>

                    <button
                        onClick={() => router.push('/purchases/new')}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-zinc-900 dark:text-white hover:bg-emerald-700"
                    >
                        <Plus size={18} />
                        Nova compra
                    </button>
                </div>

                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {flowTabs.map((tab) => {
                        const Icon = tab.icon;
                        const count =
                            tab.key === 'ALL'
                                ? purchases.length
                                : stageCounts[tab.key] || 0;
                        const isActive = activeTab === tab.key;

                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center justify-between gap-3 rounded-3xl border p-4 text-left transition ${isActive
                                    ? tab.activeClass
                                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                                    }`}
                            >
                                <div>
                                    <p className="text-2xl font-bold">{count}</p>
                                    <p className="text-sm">{tab.label}</p>
                                </div>

                                <Icon size={22} />
                            </button>
                        );
                    })}
                </section>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                        >
                            <option value="">Todas categorias</option>
                            <option value="SUPPLIER_ORDER">Pedido com fornecedor</option>
                            <option value="AVULSA_CARD">Compra avulsa</option>
                            <option value="ONLINE_MARKETPLACE">Compra online</option>
                        </select>

                        <select
                            value={supplierFilter}
                            onChange={(e) => setSupplierFilter(e.target.value)}
                            className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                        >
                            <option value="">Todos fornecedores</option>

                            {suppliers.map((supplier) => (
                                <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            setSupplierFilter('');
                            setCategoryFilter('');
                        }}
                        className="mt-3 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                        Limpar filtros
                    </button>
                </section>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">
                                {flowTabs.find((tab) => tab.key === activeTab)?.label ||
                                    'Lista de compras'}
                            </h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {visiblePurchases.length} compra(s) encontrada(s)
                            </p>
                        </div>

                        <ReceiptText className="text-zinc-500" />
                    </div>

                    {loading ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
                    ) : visiblePurchases.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhuma compra encontrada.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {visiblePurchases.map((purchase) => (
                                <div
                                    key={purchase.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <CreditCard
                                                    size={18}
                                                    className="text-emerald-400"
                                                />
                                                <h3 className="font-semibold">
                                                    {purchase.description}
                                                </h3>
                                            </div>

                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                {purchase.store.name} • {purchase.createdBy.name}
                                                {purchase.supplier?.name &&
                                                    ` • ${purchase.supplier.name}`}
                                            </p>

                                            <p className="text-sm text-zinc-500">
                                                {categoryLabel[purchase.category] ||
                                                    purchase.category}{' '}
                                                •{' '}
                                                {new Date(
                                                    purchase.createdAt,
                                                ).toLocaleDateString('pt-BR')}
                                            </p>

                                            <div className="flex flex-wrap gap-2">
                                                {purchase.fiscalDocuments?.map((doc) => {
                                                    if (!doc.fileUrl) return null;

                                                    return (
                                                        <a
                                                            key={doc.id}
                                                            href={`${API_URL}${doc.fileUrl}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
                                                        >
                                                            <FileText size={16} />
                                                            Abrir{' '}
                                                            {doc.type === 'COUPON'
                                                                ? 'cupom'
                                                                : 'NF'}
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="min-w-[260px] text-left xl:text-right">
                                            <strong className="block text-xl">
                                                {formatCurrency(purchase.value)}
                                            </strong>

                                            <div className="mt-2 flex flex-wrap gap-2 xl:justify-end">
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusColor[purchase.status] ||
                                                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                        }`}
                                                >
                                                    {statusLabel[purchase.status] ||
                                                        purchase.status}
                                                </span>

                                                {getFlowStage(purchase) === 'DIFFERENCE' &&
                                                    purchase.status !==
                                                    'RECEIVED_WITH_DIFFERENCE' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                                                            <AlertTriangle size={12} />
                                                            Recebida com diferença
                                                        </span>
                                                    )}
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2 xl:justify-end">
                                                {purchase.status ===
                                                    'WAITING_APPROVAL' && (
                                                        <>
                                                            <button
                                                                onClick={() =>
                                                                    approvePurchase(purchase.id)
                                                                }
                                                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
                                                            >
                                                                <CheckCircle2 size={16} />
                                                                Aprovar
                                                            </button>

                                                            <button
                                                                onClick={() =>
                                                                    rejectPurchase(purchase.id)
                                                                }
                                                                className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
                                                            >
                                                                <XCircle size={16} />
                                                                Reprovar
                                                            </button>
                                                        </>
                                                    )}

                                                {['WAITING_RECEIPT', 'APPROVED'].includes(
                                                    purchase.status,
                                                ) && (
                                                        <button
                                                            onClick={() =>
                                                                router.push(
                                                                    `/purchases/${purchase.id}?receive=1`,
                                                                )
                                                            }
                                                            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/20"
                                                        >
                                                            <PackageCheck size={16} />
                                                            Receber
                                                        </button>
                                                    )}

                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20">
                                                    <FileText size={16} />
                                                    Cupom
                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];

                                                            if (file) {
                                                                uploadFiscalDocument(
                                                                    purchase.id,
                                                                    file,
                                                                    'COUPON',
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </label>

                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20">
                                                    <FileText size={16} />
                                                    NF
                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];

                                                            if (file) {
                                                                uploadFiscalDocument(
                                                                    purchase.id,
                                                                    file,
                                                                    'INVOICE',
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </label>

                                                {purchase.status === 'RECEIVED_OK' && (
                                                    <button
                                                        onClick={() =>
                                                            closePurchase(purchase.id)
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
                                                    >
                                                        <CheckCircle2 size={16} />
                                                        Fechar
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() =>
                                                        router.push(
                                                            `/purchases/${purchase.id}`,
                                                        )
                                                    }
                                                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                                >
                                                    <Clock size={16} />
                                                    Detalhes
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}