'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { canManagePurchaseBilling, getUser } from '@/lib/auth';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    CreditCard,
    FileText,
    History,
    Link2,
    Loader2,
    PackageCheck,
    Plus,
    ReceiptText,
    Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import { NfMatchModal } from '../../src/components/purchases/NfMatchModal';
import { PurchaseHistoryModal } from '../../src/components/purchases/PurchaseHistoryModal';

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
    accessKey?: string | null;
};

type IncomingGoodsNfRef = {
    id: string;
    chaveAcesso: string;
};

type Receipt = {
    id: string;
    status: 'OK' | 'MISSING_ITEMS' | 'EXTRA_ITEMS' | 'PARTIAL';
    notes?: string | null;
};

type PurchaseItem = {
    id: string;
    name: string;
    quantity: string;
    unit?: string | null;
    receivedQuantity?: string | null;
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
    items?: PurchaseItem[];
    incomingGoodsNfs?: IncomingGoodsNfRef[];
    // Só pra saber se já existe conta a pagar gerada pra essa compra (via
    // Conciliar NF, Aceitar sem NF ou lançamento manual) — não precisa de
    // mais detalhe que o id aqui.
    bills?: { id: string }[];
    // Marcação manual "A pagar" (padrão) / "Pago" — pra distinguir compra
    // que ainda precisa de conta a pagar de uma que já foi quitada sem
    // passar pelo módulo financeiro (ex: pago na hora com dinheiro do
    // caixa). Não confundir com `method` (como foi/será pago).
    paymentStatus?: 'TO_PAY' | 'PAID';
};

// Uma compra "resolvida" no financeiro tem NF anexada (documento fiscal do
// tipo INVOICE, seja por upload manual ou por Conciliar NF) e/ou já tem
// conta a pagar gerada — os dois são independentes (dá pra ter só um dos
// dois, ex: "Aceitar sem NF" gera conta sem NF nenhuma).
function hasInvoiceDoc(purchase: Purchase) {
    return !!purchase.fiscalDocuments?.some((doc) => doc.type === 'INVOICE');
}

function hasBill(purchase: Purchase) {
    return (purchase.bills?.length || 0) > 0;
}

// Alerta vermelho de "falta gerar conta a pagar": só faz sentido pra
// compra que já chegou de verdade (estágio OK ou DIFFERENCE — não
// ARRIVING, que ainda nem chegou, nem OTHER, que é cancelada/rascunho e
// nunca vai gerar conta), continua marcada "A pagar" (padrão — ninguém
// disse que já foi quitada por fora) e ainda não tem nenhuma Bill
// vinculada. Reprovada nem aparece mais nessa lista (ver findAll no
// backend) — fica só na página Aprovações.
function needsBillAlert(purchase: Purchase) {
    const stage = getFlowStage(purchase);

    return (
        (stage === 'OK' || stage === 'DIFFERENCE') &&
        (purchase.paymentStatus || 'TO_PAY') === 'TO_PAY' &&
        !hasBill(purchase)
    );
}

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
    // WAITING_APPROVAL e REJECTED não aparecem mais aqui (o backend já
    // filtra em findAll) — CANCELED/DRAFT ainda podem, e caem em OTHER.
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

// Simplificação: só 2 abas na lista de Compras — "aceitas" (chegaram, com
// ou sem diferença) e "não aceitas" (ainda não chegaram, ou foram
// canceladas/ficaram rascunho). Aguardando aprovação e reprovada não
// entram mais aqui — saem direto pra página Aprovações (ver findAll no
// backend). Filtros por categoria/fornecedor e a visão detalhada por
// estágio (a chegar/chegou/diferença) ficam só no Dashboard de Compras
// (/purchases/dashboard) — aqui é só "já resolvi ou não".
type AcceptStage = 'ARRIVED' | 'NOT_ARRIVED';

function mapFlowStageToAcceptStage(stage: FlowStage): AcceptStage {
    return stage === 'OK' || stage === 'DIFFERENCE' ? 'ARRIVED' : 'NOT_ARRIVED';
}

// O Dashboard de Compras ainda manda ?tab=ARRIVING|OK|DIFFERENCE (pipeline
// detalhado) — mapeia pro par simplificado daqui, sem precisar mexer lá.
function mapTabParam(value: string | null): AcceptStage | null {
    if (value === 'ARRIVED' || value === 'NOT_ARRIVED') return value;
    if (value === 'OK' || value === 'DIFFERENCE') return 'ARRIVED';
    if (value === 'ARRIVING') return 'NOT_ARRIVED';
    return null;
}

const acceptTabs: {
    key: AcceptStage;
    label: string;
    icon: typeof Truck;
    activeClass: string;
}[] = [
    {
        key: 'NOT_ARRIVED',
        label: 'Não chegaram',
        icon: Truck,
        activeClass: 'border-amber-500 bg-amber-500/10 text-amber-500',
    },
    {
        key: 'ARRIVED',
        label: 'Chegaram',
        icon: CheckCircle2,
        activeClass: 'border-blue-500 bg-blue-500/10 text-blue-500',
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
    RECEIVED_OK: 'bg-blue-500/10 text-blue-400',
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

// Mesma ideia do badge de status, só que pro tipo da compra — ajuda a
// identificar de relance se é um pedido direto (sem aprovação) ou uma
// avulsa/online (passou por aprovação).
const categoryColor: Record<string, string> = {
    SUPPLIER_ORDER: 'bg-blue-500/10 text-blue-400',
    AVULSA_CARD: 'bg-violet-500/10 text-violet-400',
    ONLINE_MARKETPLACE: 'bg-cyan-500/10 text-cyan-400',
};

function formatCurrency(value: string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

// Mesmos rótulos usados na tela de detalhe da compra, pra ficar consistente
// entre a lista e o recebimento em si.
const receiptStatusLabel: Record<string, string> = {
    MISSING_ITEMS: 'Itens faltando',
    EXTRA_ITEMS: 'Itens recebidos a mais',
    PARTIAL: 'Recebimento parcial',
};

function formatQuantity(value: string, unit?: string | null) {
    const number = Number(value);
    const formatted = Number.isFinite(number)
        ? number.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
        : value;

    return unit ? `${formatted} ${unit}` : formatted;
}

// Monta as linhas exibidas no card da lista quando a compra "chegou com
// diferença" — junta o motivo de cada recebimento divergente, a observação
// deixada por quem recebeu e, item a item, o que foi pedido x o que chegou.
function getDifferenceDetails(purchase: Purchase): string[] {
    const details: string[] = [];

    for (const receipt of purchase.receipts || []) {
        if (receipt.status === 'OK') continue;

        details.push(receiptStatusLabel[receipt.status] || receipt.status);

        if (receipt.notes?.trim()) {
            details.push(`Obs.: ${receipt.notes.trim()}`);
        }
    }

    for (const item of purchase.items || []) {
        if (item.receivedQuantity === null || item.receivedQuantity === undefined) {
            continue;
        }

        if (Number(item.receivedQuantity) === Number(item.quantity)) continue;

        details.push(
            `${item.name}: pedido ${formatQuantity(item.quantity, item.unit)}, recebido ${formatQuantity(item.receivedQuantity, item.unit)}`,
        );
    }

    return details;
}

export default function PurchasesPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-zinc-500">Carregando...</div>}>
            <PurchasesPageInner />
        </Suspense>
    );
}

function PurchasesPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const currentUser = getUser();

    // "Aceitar e gerar conta a pagar" (Conciliar NF, Criar Conta a Pagar)
    // é função do Administrativo/Proprietário/Financeiro/Admin Master —
    // Estoquista só recebe a compra (botão Receber, sem essa restrição).
    const userCanManageBilling = canManagePurchaseBilling(currentUser);

    // Chegando do Dashboard de Compras (/purchases/dashboard) com
    // ?tab=ARRIVING|OK|DIFFERENCE — mapeia pro par de abas simplificado
    // daqui (Chegaram/Não chegaram): OK e DIFFERENCE caem em "Chegaram",
    // ARRIVING cai em "Não chegaram".
    const requestedTab = mapTabParam(searchParams.get('tab'));

    const [purchases, setPurchases] = useState<Purchase[]>([]);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<AcceptStage>(
        requestedTab || 'NOT_ARRIVED',
    );
    // Filtro client-side (não recarrega do backend): esconde as compras que
    // já têm NF vinculada ou conta a pagar criada, pra focar só no que
    // ainda precisa de Conciliar NF / Aceitar sem NF.
    const [onlyPendingBilling, setOnlyPendingBilling] = useState(false);

    // Compra selecionada pro modal de "Conciliar NF" (busca/vincula a NF
    // baixada automaticamente da Sefaz que provavelmente é dessa compra).
    const [nfMatchPurchase, setNfMatchPurchase] = useState<Purchase | null>(null);

    // Id da NF (IncomingGoodsNf) cujo DANFE está sendo baixado agora, só
    // pra mostrar o spinner no botão certo.
    const [openingDanfeId, setOpeningDanfeId] = useState<string | null>(null);

    // Compra selecionada pro modal de "Histórico" (log de auditoria: quem
    // criou, aprovou, recebeu, vinculou NF, gerou/pagou conta etc.).
    const [historyPurchase, setHistoryPurchase] = useState<Purchase | null>(
        null,
    );

    async function loadPurchases() {
        try {
            setLoading(true);

            // A loja é a que está ativa lá em cima — cada loja só vê as
            // próprias compras aqui. Filtro por categoria/fornecedor saiu
            // daqui porque já existe no Dashboard de Compras.
            const response = await api.get('/purchases', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setPurchases(response.data);
        } catch {
            toast.error('Erro ao carregar compras.');
        } finally {
            setLoading(false);
        }
    }

    // "Abrir NF" pra um documento fiscal que veio da Conciliar NF: o
    // fileUrl guardado é o XML cru baixado da Sefaz (não dá pra abrir
    // direto e entender nada), então busca o DANFE (PDF de conferência)
    // pelo endpoint de download e abre num blob — precisa passar pelo
    // axios (com o token) em vez de um <a href> simples, senão o backend
    // recusa a requisição sem autenticação.
    async function openDanfe(incomingNfId: string) {
        setOpeningDanfeId(incomingNfId);

        try {
            const response = await api.get(
                `/purchases/incoming-goods-nf/${incomingNfId}/danfe`,
                { responseType: 'blob' },
            );

            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data], { type: 'application/pdf' }),
            );

            window.open(blobUrl, '_blank');
        } catch {
            toast.error('Erro ao abrir a NF.');
        } finally {
            setOpeningDanfeId(null);
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

    // Alterna "A pagar" <-> "Pago" — marcação manual pra quando a compra já
    // foi quitada sem passar pelo módulo financeiro (ex: pago na hora com
    // dinheiro do caixa), silenciando o alerta de "falta gerar conta".
    async function togglePaymentStatus(purchase: Purchase) {
        const nextStatus =
            (purchase.paymentStatus || 'TO_PAY') === 'TO_PAY' ? 'PAID' : 'TO_PAY';

        try {
            await api.post(`/purchases/${purchase.id}/payment-status`, {
                paymentStatus: nextStatus,
            });

            await loadPurchases();
        } catch {
            toast.error('Erro ao atualizar o status de pagamento.');
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
        loadPurchases();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const stageCounts = purchases.reduce<Record<AcceptStage, number>>(
        (acc, purchase) => {
            const stage = mapFlowStageToAcceptStage(getFlowStage(purchase));
            acc[stage] = (acc[stage] || 0) + 1;
            return acc;
        },
        { ARRIVED: 0, NOT_ARRIVED: 0 },
    );

    const stageFilteredPurchases = purchases.filter(
        (purchase) =>
            mapFlowStageToAcceptStage(getFlowStage(purchase)) === activeTab,
    );

    // Contagem calculada antes do filtro de pendentes entrar, pra mostrar
    // no botão mesmo quando ele ainda não está ativo.
    const pendingBillingCount = stageFilteredPurchases.filter(
        (purchase) => !hasInvoiceDoc(purchase) && !hasBill(purchase),
    ).length;

    const visiblePurchases = onlyPendingBilling
        ? stageFilteredPurchases.filter(
            (purchase) => !hasInvoiceDoc(purchase) && !hasBill(purchase),
        )
        : stageFilteredPurchases;

    return (
        <AppLayout title="Compras">
            <div className="space-y-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">Compras</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Acompanhe recebimento, cupom, NF e fechamento.
                        </p>
                    </div>

                    <button
                        onClick={() => router.push('/purchases/new')}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                    >
                        <Plus size={18} />
                        Nova compra
                    </button>
                </div>

                <section className="grid grid-cols-2 gap-3">
                    {acceptTabs.map((tab) => {
                        const Icon = tab.icon;
                        const count = stageCounts[tab.key] || 0;
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
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-lg font-bold">
                                {acceptTabs.find((tab) => tab.key === activeTab)?.label ||
                                    'Lista de compras'}
                            </h3>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {visiblePurchases.length} compra(s) encontrada(s)
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setOnlyPendingBilling((value) => !value)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${onlyPendingBilling
                                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500'
                                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Link2 size={16} />
                                Sem NF/conta a pagar ({pendingBillingCount})
                            </button>

                            <ReceiptText className="hidden text-zinc-500 sm:block" />
                        </div>
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
                                    className="rounded-2xl border p-4 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                                >
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CreditCard
                                                    size={18}
                                                    className="text-blue-400"
                                                />
                                                <h3 className="font-semibold">
                                                    {purchase.description}
                                                </h3>

                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColor[purchase.category] ||
                                                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                        }`}
                                                >
                                                    {categoryLabel[purchase.category] ||
                                                        purchase.category}
                                                </span>
                                            </div>

                                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                {purchase.store.name} • {purchase.createdBy.name}
                                                {purchase.supplier?.name &&
                                                    ` • ${purchase.supplier.name}`}
                                            </p>

                                            <p className="text-sm text-zinc-500">
                                                {new Date(
                                                    purchase.createdAt,
                                                ).toLocaleDateString('pt-BR')}
                                            </p>

                                            <div className="flex flex-wrap gap-2">
                                                {purchase.fiscalDocuments?.map((doc) => {
                                                    if (!doc.fileUrl) return null;

                                                    // Quando essa NF veio da Conciliar NF, o fileUrl é o
                                                    // XML cru baixado da Sefaz — abre o DANFE (PDF de
                                                    // conferência) em vez do arquivo direto. Cupom e NF
                                                    // anexados à mão continuam abrindo o arquivo normal.
                                                    const incomingNf = purchase.incomingGoodsNfs?.find(
                                                        (item) => item.chaveAcesso === doc.accessKey,
                                                    );

                                                    if (doc.type === 'INVOICE' && incomingNf) {
                                                        return (
                                                            <button
                                                                key={doc.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    openDanfe(incomingNf.id)
                                                                }
                                                                disabled={
                                                                    openingDanfeId === incomingNf.id
                                                                }
                                                                className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-60"
                                                            >
                                                                {openingDanfeId === incomingNf.id ? (
                                                                    <Loader2
                                                                        size={16}
                                                                        className="animate-spin"
                                                                    />
                                                                ) : (
                                                                    <FileText size={16} />
                                                                )}
                                                                Abrir NF
                                                            </button>
                                                        );
                                                    }

                                                    return (
                                                        <a
                                                            key={doc.id}
                                                            href={`${API_URL}${doc.fileUrl}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20"
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

                                                {hasInvoiceDoc(purchase) && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400">
                                                        <FileText size={12} />
                                                        NF vinculada
                                                    </span>
                                                )}

                                                {hasBill(purchase) && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-400">
                                                        <CreditCard size={12} />
                                                        Conta a pagar criada
                                                    </span>
                                                )}

                                                {(() => {
                                                    const stage = getFlowStage(purchase);
                                                    return stage === 'OK' || stage === 'DIFFERENCE';
                                                })() && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            userCanManageBilling &&
                                                            togglePaymentStatus(purchase)
                                                        }
                                                        disabled={!userCanManageBilling}
                                                        title={
                                                            userCanManageBilling
                                                                ? 'Clique pra alternar'
                                                                : undefined
                                                        }
                                                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${(purchase.paymentStatus || 'TO_PAY') === 'PAID'
                                                            ? 'bg-blue-500/10 text-blue-500'
                                                            : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                                                            } ${userCanManageBilling ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                                    >
                                                        {(purchase.paymentStatus || 'TO_PAY') === 'PAID' ? (
                                                            <>
                                                                <CheckCircle2 size={12} />
                                                                Pago
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Clock size={12} />
                                                                A pagar
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {needsBillAlert(purchase) && (
                                                <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                                                    <p className="flex items-center gap-1 text-xs font-semibold text-red-400 xl:justify-end xl:text-right">
                                                        <AlertTriangle size={12} />
                                                        Sem conta a pagar gerada
                                                    </p>

                                                    <p className="mt-1 text-xs text-red-400/90 xl:text-right">
                                                        Se já foi paga por fora, marque como
                                                        &quot;Pago&quot; ali em cima.
                                                    </p>

                                                    {userCanManageBilling && (
                                                        <div className="mt-2 xl:text-right">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    router.push(
                                                                        `/bills/new?purchaseId=${purchase.id}`,
                                                                    )
                                                                }
                                                                className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                                                            >
                                                                <CreditCard size={14} />
                                                                Gerar conta a pagar
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {getFlowStage(purchase) === 'DIFFERENCE' && (() => {
                                                const differenceDetails =
                                                    getDifferenceDetails(purchase);

                                                return (
                                                    <div className="mt-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                                                        <p className="flex items-center gap-1 text-xs font-semibold text-red-400 xl:justify-end xl:text-right">
                                                            <AlertTriangle size={12} />
                                                            Recebida com diferença
                                                        </p>

                                                        {differenceDetails.length > 0 ? (
                                                            <ul className="mt-1.5 space-y-1 text-xs text-red-400/90 xl:text-right">
                                                                {differenceDetails.map(
                                                                    (line, index) => (
                                                                        <li key={index}>
                                                                            {line}
                                                                        </li>
                                                                    ),
                                                                )}
                                                            </ul>
                                                        ) : (
                                                            <p className="mt-1.5 text-xs text-red-400/90 xl:text-right">
                                                                Veja os detalhes na tela da
                                                                compra.
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })()}

                                            <div className="mt-3 flex flex-wrap gap-2 xl:justify-end">
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

                                                {userCanManageBilling &&
                                                    RECEIVED_STATUSES.includes(purchase.status) &&
                                                    !purchase.fiscalDocuments?.some(
                                                        (doc) => doc.type === 'INVOICE',
                                                    ) && (
                                                        <button
                                                            onClick={() =>
                                                                setNfMatchPurchase(purchase)
                                                            }
                                                            className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/20"
                                                        >
                                                            <Link2 size={16} />
                                                            Conciliar NF
                                                        </button>
                                                    )}

                                                {purchase.status === 'RECEIVED_OK' && (
                                                    <button
                                                        onClick={() =>
                                                            closePurchase(purchase.id)
                                                        }
                                                        className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/20"
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

                                                <button
                                                    onClick={() =>
                                                        setHistoryPurchase(purchase)
                                                    }
                                                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                                >
                                                    <History size={16} />
                                                    Histórico
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

            {nfMatchPurchase && (
                <NfMatchModal
                    purchaseId={nfMatchPurchase.id}
                    purchaseDescription={nfMatchPurchase.description}
                    purchaseValue={Number(nfMatchPurchase.value)}
                    purchaseSupplierName={nfMatchPurchase.supplier?.name || null}
                    onClose={() => setNfMatchPurchase(null)}
                    onLinked={loadPurchases}
                />
            )}

            {historyPurchase && (
                <PurchaseHistoryModal
                    purchaseId={historyPurchase.id}
                    purchaseDescription={historyPurchase.description}
                    onClose={() => setHistoryPurchase(null)}
                />
            )}
        </AppLayout>
    );
}