'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    Clock3,
    CreditCard,
    FileCheck2,
    FileText,
    PackageCheck,
    ReceiptText,
    ShieldCheck,
    ShoppingCart,
    Upload,
    Wallet,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getUser } from '@/lib/auth';

type PurchaseItem = {
    id: string;
    name: string;
    quantity: string;
    unit?: string | null;
    unitPrice?: string | null;
    total?: string | null;
    receivedQuantity?: string | null;
    notes?: string | null;
};

type FiscalDocument = {
    id: string;
    type: 'COUPON' | 'INVOICE';
    status: string;
    number?: string | null;
    accessKey?: string | null;
    fileUrl?: string | null;
    value?: string | null;
    createdAt: string;
    uploadedBy?: {
        id: string;
        name: string;
    } | null;
};

type PurchaseReceipt = {
    id: string;
    status: 'OK' | 'MISSING_ITEMS' | 'EXTRA_ITEMS' | 'PARTIAL';
    notes?: string | null;
    receivedAt: string;
    receivedBy: {
        id: string;
        name: string;
    };
};

type PurchaseApproval = {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    comment?: string | null;
    createdAt: string;
    approver: {
        id: string;
        name: string;
    };
};

type PurchaseHistory = {
    id: string;
    action: string;
    comment?: string | null;
    createdAt: string;
    user?: {
        id: string;
        name: string;
    } | null;
};

type Bill = {
    id: string;
    description: string;
    value: string;
    type: string;
    status: string;
    dueDate: string;
    paidAt?: string | null;
    externalLaunchStatus: string;
    externalSystemName?: string | null;
    fileUrl?: string | null;
    imageUrl?: string | null;
};

type PurchaseDetail = {
    id: string;
    description: string;
    value: string;
    status: string;
    category: string;
    origin: string;
    method: string;
    requiresApproval: boolean;

    externalOrderCode?: string | null;
    purchasedAt?: string | null;
    dueDate?: string | null;
    notes?: string | null;

    createdAt: string;
    approvedAt?: string | null;
    rejectedAt?: string | null;
    rejectionReason?: string | null;
    checkedAt?: string | null;
    closedAt?: string | null;

    store: {
        id: string;
        name: string;
    };

    supplier?: {
        id: string;
        name: string;
    } | null;

    card?: {
        id: string;
        name: string;
        lastDigits?: string | null;
    } | null;

    createdBy: {
        id: string;
        name: string;
    };

    updatedBy?: {
        id: string;
        name: string;
    } | null;

    approvedBy?: {
        id: string;
        name: string;
    } | null;

    checkedBy?: {
        id: string;
        name: string;
    } | null;

    invoiceResponsible?: {
        id: string;
        name: string;
    } | null;

    closedBy?: {
        id: string;
        name: string;
    } | null;

    items: PurchaseItem[];
    receipts: PurchaseReceipt[];
    approvals: PurchaseApproval[];
    fiscalDocuments: FiscalDocument[];
    histories: PurchaseHistory[];
    bills: Bill[];
};

type ReceiptItemForm = {
    itemId: string;
    receivedQuantity: string;
    notes: string;
};

const purchaseStatusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida corretamente',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com divergência',
    WAITING_INVOICE: 'Aguardando nota fiscal',
    HAS_COUPON_ONLY: 'Apenas com cupom',
    HAS_INVOICE: 'Nota fiscal anexada',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

const purchaseStatusColor: Record<string, string> = {
    DRAFT: 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    WAITING_APPROVAL:
        'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    APPROVED: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    REJECTED: 'border-red-500/30 bg-red-500/10 text-red-400',
    WAITING_RECEIPT:
        'border-orange-500/30 bg-orange-500/10 text-orange-400',
    RECEIVED_OK:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    RECEIVED_WITH_DIFFERENCE:
        'border-red-500/30 bg-red-500/10 text-red-400',
    WAITING_INVOICE:
        'border-orange-500/30 bg-orange-500/10 text-orange-400',
    HAS_COUPON_ONLY:
        'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    HAS_INVOICE:
        'border-purple-500/30 bg-purple-500/10 text-purple-400',
    WAITING_PAYMENT_REGISTER:
        'border-cyan-500/30 bg-cyan-500/10 text-cyan-400',
    CLOSED: 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
    CANCELED: 'border-red-500/30 bg-red-500/10 text-red-400',
};

const categoryLabel: Record<string, string> = {
    SUPPLIER_ORDER: 'Pedido com fornecedor',
    AVULSA_CARD: 'Compra avulsa',
    ONLINE_MARKETPLACE: 'Compra online / marketplace',
};

const originLabel: Record<string, string> = {
    NORMAL: 'Pedido normal',
    WEBSITE: 'Site',
    MERCADO_LIVRE: 'Mercado Livre',
    WHATSAPP: 'WhatsApp',
    PHONE: 'Telefone',
    STORE_COUNTER: 'Compra presencial',
    OTHER: 'Outro',
};

const paymentMethodLabel: Record<string, string> = {
    CREDIT_CARD: 'Cartão de crédito',
    CASH: 'Dinheiro',
    PIX: 'PIX',
    COMPANY_ACCOUNT: 'Conta da empresa',
    BOLETO: 'Boleto',
};

const receiptStatusLabel: Record<string, string> = {
    OK: 'Tudo correto',
    MISSING_ITEMS: 'Itens faltando',
    EXTRA_ITEMS: 'Itens recebidos a mais',
    PARTIAL: 'Recebimento parcial',
};

const historyLabel: Record<string, string> = {
    CREATED: 'Compra criada',
    UPDATED: 'Compra atualizada',
    APPROVED: 'Compra aprovada',
    REJECTED: 'Compra reprovada',
    COUPON_UPLOADED: 'Cupom fiscal anexado',
    INVOICE_UPLOADED: 'Nota fiscal anexada',
    RECEIVED: 'Mercadoria recebida',
    CLOSED: 'Compra fechada',
    BILL_CREATED: 'Conta a pagar criada',
    BILL_PAID: 'Conta paga',
    DELETION_REQUESTED: 'Exclusão solicitada',
};

function formatCurrency(value: number | string | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) {
        return 'Não informado';
    }

    return new Date(value).toLocaleString('pt-BR');
}

function parseDecimal(value: string) {
    const normalized = value
        .trim()
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : 0;
}

export default function PurchaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const purchaseId = String(params.id);
    const openReceiptOnLoad = searchParams.get('receive') === '1';

    const user = getUser();

    const [purchase, setPurchase] =
        useState<PurchaseDetail | null>(null);

    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const [showReceiptForm, setShowReceiptForm] =
        useState(false);

    const [receiptStatus, setReceiptStatus] =
        useState<
            'OK' | 'MISSING_ITEMS' | 'EXTRA_ITEMS' | 'PARTIAL'
        >('OK');

    const [receiptNotes, setReceiptNotes] = useState('');
    const [receiptItems, setReceiptItems] = useState<
        ReceiptItemForm[]
    >([]);

    async function loadPurchase() {
        try {
            setLoading(true);

            const response = await api.get(
                `/purchases/${purchaseId}`,
            );

            const loadedPurchase: PurchaseDetail = response.data;

            setPurchase(loadedPurchase);

            setReceiptItems(
                loadedPurchase.items.map((item) => ({
                    itemId: item.id,
                    receivedQuantity:
                        item.receivedQuantity ||
                        String(item.quantity),
                    notes: '',
                })),
            );
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao carregar compra.';

            toast.error(
                Array.isArray(message)
                    ? message.join(', ')
                    : message,
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadPurchase();
    }, [purchaseId]);

    // Veio da lista de compras com o botão "Receber" — abre direto o
    // formulário de confirmação de recebimento, sem precisar clicar de novo.
    useEffect(() => {
        if (!openReceiptOnLoad || !purchase) return;

        const receivableStatuses = [
            'APPROVED',
            'WAITING_RECEIPT',
            'RECEIVED_WITH_DIFFERENCE',
        ];

        if (receivableStatuses.includes(purchase.status)) {
            setShowReceiptForm(true);
        }

        router.replace(`/purchases/${purchaseId}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openReceiptOnLoad, purchase]);

    const canApprove = useMemo(() => {
        return ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'].includes(
            user?.role || '',
        );
    }, [user]);

    const canReceive = useMemo(() => {
        return ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'ESTOQUISTA'].includes(
            user?.role || '',
        );
    }, [user]);

    const canUploadFiscalDocument = useMemo(() => {
        return [
            'ADMINISTRATIVO',
            'PROPRIETARIO',
            'GERENTE',
            'COMPRADOR',
            'ESTOQUISTA',
        ].includes(user?.role || '');
    }, [user]);

    const hasInvoice = purchase?.fiscalDocuments.some(
        (document) => document.type === 'INVOICE',
    );

    const hasCoupon = purchase?.fiscalDocuments.some(
        (document) => document.type === 'COUPON',
    );

    const latestReceipt =
        purchase?.receipts?.[purchase.receipts.length - 1];

    async function approvePurchase() {
        const comment =
            window.prompt('Observação da aprovação:') || undefined;

        try {
            setProcessing(true);

            await api.post(`/purchases/${purchaseId}/approve`, {
                comment,
            });

            toast.success('Compra aprovada.');
            await loadPurchase();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao aprovar compra.',
            );
        } finally {
            setProcessing(false);
        }
    }

    async function rejectPurchase() {
        const comment = window.prompt(
            'Informe o motivo da reprovação:',
        );

        if (!comment?.trim()) {
            return;
        }

        try {
            setProcessing(true);

            await api.post(`/purchases/${purchaseId}/reject`, {
                comment,
            });

            toast.success('Compra reprovada.');
            await loadPurchase();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao reprovar compra.',
            );
        } finally {
            setProcessing(false);
        }
    }

    function updateReceiptItem(
        itemId: string,
        field: 'receivedQuantity' | 'notes',
        value: string,
    ) {
        setReceiptItems((currentItems) =>
            currentItems.map((item) =>
                item.itemId === itemId
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item,
            ),
        );
    }

    async function confirmReceipt() {
        if (!purchase) {
            return;
        }

        const hasInvalidQuantity = receiptItems.some(
            (item) =>
                parseDecimal(item.receivedQuantity) < 0,
        );

        if (hasInvalidQuantity) {
            toast.error(
                'A quantidade recebida não pode ser negativa.',
            );
            return;
        }

        try {
            setProcessing(true);

            await api.post(`/purchases/${purchaseId}/receive`, {
                status: receiptStatus,
                notes: receiptNotes.trim() || undefined,
                itemReceipts: receiptItems.map((item) => ({
                    itemId: item.itemId,
                    receivedQuantity: parseDecimal(
                        item.receivedQuantity,
                    ),
                    notes: item.notes.trim() || undefined,
                })),
            });

            toast.success('Recebimento registrado.');

            setShowReceiptForm(false);
            setReceiptNotes('');
            await loadPurchase();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao registrar recebimento.',
            );
        } finally {
            setProcessing(false);
        }
    }

    async function uploadFiscalDocument(
        file: File,
        type: 'COUPON' | 'INVOICE',
    ) {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('type', type);

        try {
            setProcessing(true);

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
                type === 'COUPON'
                    ? 'Cupom fiscal anexado.'
                    : 'Nota fiscal anexada.',
            );

            await loadPurchase();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao anexar documento fiscal.',
            );
        } finally {
            setProcessing(false);
        }
    }

    async function closePurchase() {
        const confirmed = window.confirm(
            'Deseja realmente fechar esta compra?',
        );

        if (!confirmed) {
            return;
        }

        try {
            setProcessing(true);

            await api.post(`/purchases/${purchaseId}/close`);

            toast.success('Compra fechada.');
            await loadPurchase();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao fechar compra.',
            );
        } finally {
            setProcessing(false);
        }
    }

    if (loading) {
        return (
            <AppLayout title="Detalhe da compra">
                <p className="text-zinc-600 dark:text-zinc-400">
                    Carregando compra...
                </p>
            </AppLayout>
        );
    }

    if (!purchase) {
        return (
            <AppLayout title="Detalhe da compra">
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                    <p className="text-zinc-600 dark:text-zinc-400">
                        Compra não encontrada.
                    </p>

                    <button
                        type="button"
                        onClick={() => router.push('/purchases')}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                    >
                        <ArrowLeft size={18} />
                        Voltar
                    </button>
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Detalhe da compra">
            <div className="space-y-5">
                <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <button
                            type="button"
                            onClick={() =>
                                router.push('/purchases')
                            }
                            className="mb-3 inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                        >
                            <ArrowLeft size={16} />
                            Voltar para compras
                        </button>

                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-400">
                                <ShoppingCart size={25} />
                            </div>

                            <div>
                                <h2 className="text-2xl font-bold">
                                    {purchase.description}
                                </h2>

                                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                                    {purchase.store.name} • Cadastrada
                                    por {purchase.createdBy.name}
                                </p>

                                <p className="mt-1 text-xs text-zinc-500">
                                    Criada em{' '}
                                    {formatDate(purchase.createdAt)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={`rounded-full border px-4 py-2 text-sm font-medium ${purchaseStatusColor[
                                purchase.status
                            ] ||
                                'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                }`}
                        >
                            {purchaseStatusLabel[
                                purchase.status
                            ] || purchase.status}
                        </span>

                        <strong className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-xl text-emerald-400">
                            {formatCurrency(purchase.value)}
                        </strong>
                    </div>
                </header>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_390px]">
                    <div className="space-y-4">
                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        Informações da compra
                                    </h3>

                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Origem, fornecedor, pagamento e
                                        responsáveis.
                                    </p>
                                </div>

                                <ReceiptText className="text-zinc-500" />
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                                <InfoCard
                                    title="Tipo da compra"
                                    value={
                                        categoryLabel[
                                        purchase.category
                                        ] || purchase.category
                                    }
                                />

                                <InfoCard
                                    title="Origem"
                                    value={
                                        originLabel[
                                        purchase.origin
                                        ] || purchase.origin
                                    }
                                />

                                <InfoCard
                                    title="Forma de pagamento"
                                    value={
                                        paymentMethodLabel[
                                        purchase.method
                                        ] || purchase.method
                                    }
                                />

                                <InfoCard
                                    title="Fornecedor"
                                    value={
                                        purchase.supplier?.name ||
                                        'Não informado'
                                    }
                                />

                                <InfoCard
                                    title="Data da compra"
                                    value={formatDate(
                                        purchase.purchasedAt,
                                    )}
                                />

                                <InfoCard
                                    title="Vencimento previsto"
                                    value={formatDate(
                                        purchase.dueDate,
                                    )}
                                />

                                {purchase.externalOrderCode && (
                                    <InfoCard
                                        title="Código do pedido"
                                        value={
                                            purchase.externalOrderCode
                                        }
                                    />
                                )}

                                <InfoCard
                                    title="Exige aprovação"
                                    value={
                                        purchase.requiresApproval
                                            ? 'Sim'
                                            : 'Não'
                                    }
                                />

                                <InfoCard
                                    title="Responsável pela NF"
                                    value={
                                        purchase
                                            .invoiceResponsible
                                            ?.name ||
                                        'Não definido'
                                    }
                                />
                            </div>

                            {purchase.card && (
                                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                                    <CreditCard className="text-blue-400" />

                                    <div>
                                        <p className="text-sm text-blue-300">
                                            Cartão utilizado
                                        </p>

                                        <strong>
                                            {purchase.card.name}
                                            {purchase.card
                                                .lastDigits &&
                                                ` • final ${purchase.card.lastDigits}`}
                                        </strong>
                                    </div>
                                </div>
                            )}

                            {purchase.notes && (
                                <div className="mt-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                                    <p className="text-sm text-zinc-500">
                                        Observações
                                    </p>

                                    <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                                        {purchase.notes}
                                    </p>
                                </div>
                            )}
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        Itens da compra
                                    </h3>

                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Quantidade pedida e recebida.
                                    </p>
                                </div>

                                <PackageCheck className="text-orange-400" />
                            </div>

                            {purchase.items.length === 0 ? (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Nenhum item cadastrado.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead>
                                            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500">
                                                <th className="px-3 py-3">
                                                    Produto
                                                </th>
                                                <th className="px-3 py-3">
                                                    Pedido
                                                </th>
                                                <th className="px-3 py-3">
                                                    Recebido
                                                </th>
                                                <th className="px-3 py-3">
                                                    Unitário
                                                </th>
                                                <th className="px-3 py-3">
                                                    Total
                                                </th>
                                                <th className="px-3 py-3">
                                                    Situação
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {purchase.items.map(
                                                (item) => {
                                                    const ordered =
                                                        Number(
                                                            item.quantity,
                                                        );

                                                    const received =
                                                        item.receivedQuantity ===
                                                            null ||
                                                            item.receivedQuantity ===
                                                            undefined
                                                            ? null
                                                            : Number(
                                                                item.receivedQuantity,
                                                            );

                                                    const difference =
                                                        received ===
                                                            null
                                                            ? null
                                                            : received -
                                                            ordered;

                                                    return (
                                                        <tr
                                                            key={
                                                                item.id
                                                            }
                                                            className="border-b border-zinc-200/70 dark:border-zinc-800/70"
                                                        >
                                                            <td className="px-3 py-4">
                                                                <strong>
                                                                    {
                                                                        item.name
                                                                    }
                                                                </strong>

                                                                {item.notes && (
                                                                    <p className="mt-1 text-xs text-zinc-500">
                                                                        {
                                                                            item.notes
                                                                        }
                                                                    </p>
                                                                )}
                                                            </td>

                                                            <td className="px-3 py-4">
                                                                {
                                                                    item.quantity
                                                                }{' '}
                                                                {item.unit ||
                                                                    ''}
                                                            </td>

                                                            <td className="px-3 py-4">
                                                                {received ===
                                                                    null
                                                                    ? '-'
                                                                    : `${received} ${item.unit ||
                                                                    ''
                                                                    }`}
                                                            </td>

                                                            <td className="px-3 py-4">
                                                                {item.unitPrice
                                                                    ? formatCurrency(
                                                                        item.unitPrice,
                                                                    )
                                                                    : '-'}
                                                            </td>

                                                            <td className="px-3 py-4">
                                                                {item.total
                                                                    ? formatCurrency(
                                                                        item.total,
                                                                    )
                                                                    : '-'}
                                                            </td>

                                                            <td className="px-3 py-4">
                                                                {difference ===
                                                                    null ? (
                                                                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400">
                                                                        Aguardando
                                                                    </span>
                                                                ) : difference ===
                                                                    0 ? (
                                                                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
                                                                        Correto
                                                                    </span>
                                                                ) : difference <
                                                                    0 ? (
                                                                    <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs text-red-400">
                                                                        Faltaram{' '}
                                                                        {Math.abs(
                                                                            difference,
                                                                        )}{' '}
                                                                        {item.unit ||
                                                                            ''}
                                                                    </span>
                                                                ) : (
                                                                    <span className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-400">
                                                                        Vieram{' '}
                                                                        {
                                                                            difference
                                                                        }{' '}
                                                                        {item.unit ||
                                                                            ''}{' '}
                                                                        a
                                                                        mais
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                },
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        Recebimento
                                    </h3>

                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Quem recebeu e como a mercadoria
                                        chegou.
                                    </p>
                                </div>

                                <PackageCheck className="text-emerald-400" />
                            </div>

                            {purchase.receipts.length === 0 ? (
                                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                                    <p className="font-medium text-orange-300">
                                        Mercadoria ainda não recebida
                                    </p>

                                    <p className="mt-1 text-sm text-orange-400/70">
                                        Aguarda conferência do
                                        responsável pela loja.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {purchase.receipts.map(
                                        (receipt) => (
                                            <div
                                                key={receipt.id}
                                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                            >
                                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                    <div>
                                                        <p className="font-semibold">
                                                            {
                                                                receiptStatusLabel[
                                                                receipt
                                                                    .status
                                                                ]
                                                            }
                                                        </p>

                                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                            Recebido
                                                            por{' '}
                                                            {
                                                                receipt
                                                                    .receivedBy
                                                                    .name
                                                            }
                                                        </p>

                                                        {receipt.notes && (
                                                            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                                                                {
                                                                    receipt.notes
                                                                }
                                                            </p>
                                                        )}
                                                    </div>

                                                    <p className="text-xs text-zinc-500">
                                                        {formatDate(
                                                            receipt.receivedAt,
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}

                            {latestReceipt &&
                                latestReceipt.status !== 'OK' && (
                                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                                        <AlertTriangle className="mt-0.5 text-red-400" />

                                        <div>
                                            <p className="font-semibold text-red-300">
                                                Recebimento com
                                                divergência
                                            </p>

                                            <p className="mt-1 text-sm text-red-400/70">
                                                A compradora ou o
                                                responsável deve avaliar
                                                os itens e decidir como
                                                prosseguir.
                                            </p>
                                        </div>
                                    </div>
                                )}
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-lg font-bold">
                                        Documentos fiscais
                                    </h3>

                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Cupom fiscal, nota fiscal, PDF,
                                        imagem ou XML.
                                    </p>
                                </div>

                                <FileCheck2 className="text-purple-400" />
                            </div>

                            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div
                                    className={`rounded-2xl border p-4 ${hasCoupon
                                        ? 'border-emerald-500/20 bg-emerald-500/10'
                                        : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                                        }`}
                                >
                                    <p className="text-sm text-zinc-500">
                                        Cupom fiscal
                                    </p>

                                    <strong
                                        className={
                                            hasCoupon
                                                ? 'text-emerald-400'
                                                : 'text-zinc-700 dark:text-zinc-300'
                                        }
                                    >
                                        {hasCoupon
                                            ? 'Anexado'
                                            : 'Não anexado'}
                                    </strong>
                                </div>

                                <div
                                    className={`rounded-2xl border p-4 ${hasInvoice
                                        ? 'border-emerald-500/20 bg-emerald-500/10'
                                        : 'border-red-500/20 bg-red-500/10'
                                        }`}
                                >
                                    <p className="text-sm text-zinc-500">
                                        Nota fiscal
                                    </p>

                                    <strong
                                        className={
                                            hasInvoice
                                                ? 'text-emerald-400'
                                                : 'text-red-400'
                                        }
                                    >
                                        {hasInvoice
                                            ? 'Anexada'
                                            : 'Pendente'}
                                    </strong>
                                </div>
                            </div>

                            {purchase.fiscalDocuments.length ===
                                0 ? (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Nenhum documento anexado.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {purchase.fiscalDocuments.map(
                                        (document) => (
                                            <div
                                                key={document.id}
                                                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 md:flex-row md:items-center md:justify-between"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="rounded-xl bg-purple-500/10 p-2 text-purple-400">
                                                        <FileText
                                                            size={19}
                                                        />
                                                    </div>

                                                    <div>
                                                        <p className="font-semibold">
                                                            {document.type ===
                                                                'COUPON'
                                                                ? 'Cupom fiscal'
                                                                : 'Nota fiscal'}
                                                        </p>

                                                        <p className="text-xs text-zinc-500">
                                                            {formatDate(
                                                                document.createdAt,
                                                            )}
                                                            {document
                                                                .uploadedBy
                                                                ?.name
                                                                ? ` • ${document.uploadedBy.name}`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {document.fileUrl && (
                                                        <a
                                                            href={`${API_URL}${document.fileUrl}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20"
                                                        >
                                                            <FileText
                                                                size={
                                                                    16
                                                                }
                                                            />
                                                            Abrir
                                                            arquivo
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ),
                                    )}
                                </div>
                            )}

                            {canUploadFiscalDocument && (
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20">
                                        <Upload size={17} />
                                        Anexar cupom

                                        <input
                                            type="file"
                                            accept="image/*,.pdf,.xml"
                                            className="hidden"
                                            disabled={processing}
                                            onChange={(event) => {
                                                const file =
                                                    event.target
                                                        .files?.[0];

                                                if (file) {
                                                    uploadFiscalDocument(
                                                        file,
                                                        'COUPON',
                                                    );
                                                }

                                                event.target.value =
                                                    '';
                                            }}
                                        />
                                    </label>

                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-400 hover:bg-purple-500/20">
                                        <Upload size={17} />
                                        Anexar NF

                                        <input
                                            type="file"
                                            accept="image/*,.pdf,.xml"
                                            className="hidden"
                                            disabled={processing}
                                            onChange={(event) => {
                                                const file =
                                                    event.target
                                                        .files?.[0];

                                                if (file) {
                                                    uploadFiscalDocument(
                                                        file,
                                                        'INVOICE',
                                                    );
                                                }

                                                event.target.value =
                                                    '';
                                            }}
                                        />
                                    </label>
                                </div>
                            )}
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            router.push(
                                                `/bills/new?purchaseId=${purchase.id}`,
                                            )
                                        }
                                        className="mt-5 rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-cyan-700"
                                    >
                                        Criar Conta a Pagar
                                    </button>

                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Boleto, PIX, cartão ou lançamento
                                        sem boleto.
                                    </p>
                                </div>

                                <Wallet className="text-cyan-400" />
                            </div>

                            {purchase.bills.length === 0 ? (
                                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                                    <p className="font-medium text-orange-300">
                                        Conta a pagar ainda não
                                        cadastrada
                                    </p>

                                    <p className="mt-1 text-sm text-orange-400/70">
                                        Depois do recebimento e da NF,
                                        o financeiro deve registrar o
                                        pagamento.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {purchase.bills.map((bill) => (
                                        <div
                                            key={bill.id}
                                            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <p className="font-semibold">
                                                        {
                                                            bill.description
                                                        }
                                                    </p>

                                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                                        {
                                                            bill.type
                                                        }{' '}
                                                        • Vencimento:{' '}
                                                        {formatDate(
                                                            bill.dueDate,
                                                        )}
                                                    </p>

                                                    <p className="mt-1 text-xs text-zinc-500">
                                                        Lançamento
                                                        externo:{' '}
                                                        {bill.externalLaunchStatus ===
                                                            'LAUNCHED'
                                                            ? `Lançado${bill.externalSystemName
                                                                ? ` no ${bill.externalSystemName}`
                                                                : ''
                                                            }`
                                                            : 'Não lançado'}
                                                    </p>
                                                </div>

                                                <div className="text-left md:text-right">
                                                    <strong className="text-lg text-cyan-400">
                                                        {formatCurrency(
                                                            bill.value,
                                                        )}
                                                    </strong>

                                                    <p className="mt-1 text-xs text-zinc-500">
                                                        {
                                                            bill.status
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>

                    <aside className="space-y-4">
                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <h3 className="mb-4 text-lg font-bold">
                                Ações
                            </h3>

                            <div className="space-y-3">
                                {purchase.status ===
                                    'WAITING_APPROVAL' &&
                                    canApprove && (
                                        <>
                                            <button
                                                type="button"
                                                disabled={
                                                    processing
                                                }
                                                onClick={
                                                    approvePurchase
                                                }
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                <ShieldCheck
                                                    size={18}
                                                />
                                                Aprovar compra
                                            </button>

                                            <button
                                                type="button"
                                                disabled={
                                                    processing
                                                }
                                                onClick={
                                                    rejectPurchase
                                                }
                                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                            >
                                                <XCircle
                                                    size={18}
                                                />
                                                Reprovar compra
                                            </button>
                                        </>
                                    )}

                                {[
                                    'APPROVED',
                                    'WAITING_RECEIPT',
                                    'RECEIVED_WITH_DIFFERENCE',
                                ].includes(purchase.status) &&
                                    canReceive && (
                                        <button
                                            type="button"
                                            disabled={
                                                processing
                                            }
                                            onClick={() =>
                                                setShowReceiptForm(
                                                    true,
                                                )
                                            }
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-cyan-700 disabled:opacity-50"
                                        >
                                            <PackageCheck
                                                size={18}
                                            />
                                            Registrar recebimento
                                        </button>
                                    )}

                                {purchase.status ===
                                    'RECEIVED_OK' &&
                                    hasInvoice && (
                                        <button
                                            type="button"
                                            disabled={
                                                processing
                                            }
                                            onClick={
                                                closePurchase
                                            }
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                                        >
                                            <CheckCircle2
                                                size={18}
                                            />
                                            Fechar compra
                                        </button>
                                    )}

                                {!canApprove &&
                                    !canReceive &&
                                    purchase.status !==
                                    'RECEIVED_OK' && (
                                        <p className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-sm text-zinc-600 dark:text-zinc-400">
                                            Seu perfil pode acompanhar
                                            esta compra, mas não possui
                                            uma ação disponível no status
                                            atual.
                                        </p>
                                    )}
                            </div>
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <h3 className="mb-5 text-lg font-bold">
                                Responsáveis
                            </h3>

                            <div className="space-y-3">
                                <PersonRow
                                    title="Criada por"
                                    name={purchase.createdBy.name}
                                    date={purchase.createdAt}
                                />

                                <PersonRow
                                    title="Aprovada por"
                                    name={
                                        purchase.approvedBy?.name ||
                                        'Pendente'
                                    }
                                    date={purchase.approvedAt}
                                />

                                <PersonRow
                                    title="Recebida por"
                                    name={
                                        purchase.checkedBy?.name ||
                                        'Pendente'
                                    }
                                    date={purchase.checkedAt}
                                />

                                <PersonRow
                                    title="Fechada por"
                                    name={
                                        purchase.closedBy?.name ||
                                        'Pendente'
                                    }
                                    date={purchase.closedAt}
                                />
                            </div>
                        </section>

                        <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <div className="mb-5 flex items-center justify-between">
                                <h3 className="text-lg font-bold">
                                    Timeline
                                </h3>

                                <Clock3 className="text-zinc-500" />
                            </div>

                            {purchase.histories.length === 0 ? (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    Nenhum histórico registrado.
                                </p>
                            ) : (
                                <div className="space-y-0">
                                    {purchase.histories.map(
                                        (history, index) => {
                                            const successActions = [
                                                'APPROVED',
                                                'RECEIVED',
                                                'INVOICE_UPLOADED',
                                                'CLOSED',
                                                'BILL_PAID',
                                            ];

                                            const rejectedActions = [
                                                'REJECTED',
                                            ];

                                            return (
                                                <div
                                                    key={history.id}
                                                    className="relative flex gap-3 pb-5"
                                                >
                                                    {index <
                                                        purchase
                                                            .histories
                                                            .length -
                                                        1 && (
                                                            <div className="absolute left-[9px] top-6 h-[calc(100%-16px)] w-px bg-zinc-100 dark:bg-zinc-800" />
                                                        )}

                                                    <div className="relative z-10 mt-1">
                                                        {successActions.includes(
                                                            history.action,
                                                        ) ? (
                                                            <CheckCircle2
                                                                size={
                                                                    19
                                                                }
                                                                className="text-emerald-400"
                                                            />
                                                        ) : rejectedActions.includes(
                                                            history.action,
                                                        ) ? (
                                                            <XCircle
                                                                size={
                                                                    19
                                                                }
                                                                className="text-red-400"
                                                            />
                                                        ) : (
                                                            <Clock3
                                                                size={
                                                                    19
                                                                }
                                                                className="text-zinc-500"
                                                            />
                                                        )}
                                                    </div>

                                                    <div>
                                                        <p className="font-medium">
                                                            {historyLabel[
                                                                history
                                                                    .action
                                                            ] ||
                                                                history.action}
                                                        </p>

                                                        <p className="mt-1 text-xs text-zinc-500">
                                                            {formatDate(
                                                                history.createdAt,
                                                            )}
                                                        </p>

                                                        {history.user
                                                            ?.name && (
                                                                <p className="mt-1 text-xs text-zinc-500">
                                                                    Por:{' '}
                                                                    {
                                                                        history
                                                                            .user
                                                                            .name
                                                                    }
                                                                </p>
                                                            )}

                                                        {history.comment && (
                                                            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                                                                {
                                                                    history.comment
                                                                }
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            )}
                        </section>
                    </aside>
                </section>

                {showReceiptForm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
                        <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 shadow-2xl">
                            <div className="mb-5 flex items-start justify-between gap-4">
                                <div>
                                    <h3 className="text-xl font-bold">
                                        Registrar recebimento
                                    </h3>

                                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                        Confira item por item e informe
                                        qualquer divergência.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowReceiptForm(false)
                                    }
                                    className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                >
                                    <XCircle size={21} />
                                </button>
                            </div>

                            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Como a compra chegou?
                                    </label>

                                    <select
                                        value={receiptStatus}
                                        onChange={(event) =>
                                            setReceiptStatus(
                                                event.target
                                                    .value as typeof receiptStatus,
                                            )
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 outline-none focus:border-cyan-500"
                                    >
                                        <option value="OK">
                                            Tudo correto
                                        </option>
                                        <option value="MISSING_ITEMS">
                                            Faltando itens
                                        </option>
                                        <option value="EXTRA_ITEMS">
                                            Vieram itens a mais
                                        </option>
                                        <option value="PARTIAL">
                                            Recebimento parcial
                                        </option>
                                    </select>
                                </div>

                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Observação geral
                                    </label>

                                    <input
                                        value={receiptNotes}
                                        onChange={(event) =>
                                            setReceiptNotes(
                                                event.target.value,
                                            )
                                        }
                                        placeholder="Ex.: Faltaram 2 kg de frango"
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 outline-none focus:border-cyan-500"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                {purchase.items.map((item) => {
                                    const receiptItem =
                                        receiptItems.find(
                                            (currentItem) =>
                                                currentItem.itemId ===
                                                item.id,
                                        );

                                    return (
                                        <div
                                            key={item.id}
                                            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
                                        >
                                            <div className="mb-3">
                                                <p className="font-semibold">
                                                    {item.name}
                                                </p>

                                                <p className="text-sm text-zinc-500">
                                                    Pedido:{' '}
                                                    {item.quantity}{' '}
                                                    {item.unit || ''}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr]">
                                                <div>
                                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                        Quantidade
                                                        recebida
                                                    </label>

                                                    <input
                                                        value={
                                                            receiptItem?.receivedQuantity ||
                                                            ''
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            updateReceiptItem(
                                                                item.id,
                                                                'receivedQuantity',
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        inputMode="decimal"
                                                        className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-cyan-500"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                                        Observação
                                                        do item
                                                    </label>

                                                    <input
                                                        value={
                                                            receiptItem?.notes ||
                                                            ''
                                                        }
                                                        onChange={(
                                                            event,
                                                        ) =>
                                                            updateReceiptItem(
                                                                item.id,
                                                                'notes',
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                        }
                                                        placeholder="Motivo da diferença, devolução ou autorização"
                                                        className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-cyan-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowReceiptForm(false)
                                    }
                                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                >
                                    Cancelar
                                </button>

                                <button
                                    type="button"
                                    disabled={processing}
                                    onClick={confirmReceipt}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-cyan-700 disabled:opacity-50"
                                >
                                    <PackageCheck size={18} />
                                    {processing
                                        ? 'Salvando...'
                                        : 'Confirmar recebimento'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}

function InfoCard({
    title,
    value,
}: {
    title: string;
    value: string;
}) {
    return (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
            <p className="text-sm text-zinc-500">{title}</p>
            <strong className="mt-1 block">{value}</strong>
        </div>
    );
}

function PersonRow({
    title,
    name,
    date,
}: {
    title: string;
    name: string;
    date?: string | null;
}) {
    return (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
            <p className="text-sm text-zinc-500">{title}</p>
            <strong className="mt-1 block">{name}</strong>

            {date && (
                <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(date)}
                </p>
            )}
        </div>
    );
}