'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    AlertTriangle,
    Banknote,
    Building2,
    Calendar,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardCopy,
    Clock,
    CreditCard,
    Download,
    ExternalLink,
    FileText,
    Landmark,
    Pencil,
    Plus,
    ReceiptText,
    Search,
    Settings,
    SlidersHorizontal,
    Wallet,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { AutocompleteInput } from '../../src/components/ui/AutocompleteInput';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { canManagePaymentBatch, getUser } from '@/lib/auth';
import {
    BatchPaymentModal,
    BatchPaymentSummaryModal,
} from '../../src/components/bills/BatchPaymentModal';

type Store = {
    id: string;
    name: string;
};

type Supplier = {
    id: string;
    name: string;
};

type Purchase = {
    id: string;
    description: string;
    value: string;
    store?: Store;
    supplier?: Supplier | null;
};

type Bill = {
    id: string;
    description: string;
    value: string;

    type: string;
    paymentMethod: string;

    dueDate: string;
    paidAt?: string | null;
    queuedForPaymentAt?: string | null;

    status: string;

    hasBillFile: boolean;

    barcode?: string | null;

    pixKey?: string | null;
    pixKeyType?: string | null;
    pixQrCode?: string | null;

    bankName?: string | null;
    bankAgency?: string | null;
    bankAccount?: string | null;
    beneficiary?: string | null;

    fileUrl?: string | null;
    imageUrl?: string | null;
    paymentProofUrl?: string | null;

    notes?: string | null;
    createdAt: string;

    store: Store;
    supplier?: Supplier | null;
    purchase?: Purchase | null;

    launchedBy: {
        id: string;
        name: string;
        email: string;
    };
};

const billTypeLabel: Record<string, string> = {
    BOLETO: 'Boleto',
    PIX: 'PIX',
    CARD: 'Cartão',
    NO_BILL: 'Sem boleto',
};

const paymentMethodLabel: Record<string, string> = {
    BANK_SLIP: 'Boleto',
    PIX: 'PIX',
    CREDIT_CARD: 'Cartão de crédito',
    DEBIT_CARD: 'Cartão de débito',
    CASH: 'Dinheiro',
    FLASH: 'Flash',
    BANK_TRANSFER: 'Transferência bancária',
    COMPANY_ACCOUNT: 'Conta da empresa',
};

const pixKeyTypeLabel: Record<string, string> = {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    EMAIL: 'E-mail',
    PHONE: 'Telefone',
    RANDOM: 'Chave aleatória',
    EVP: 'EVP',
};

const billStatusLabel: Record<string, string> = {
    OPEN: 'Em aberto',
    PAID: 'Pago',
    OVERDUE: 'Vencido',
    CANCELED: 'Cancelado',
};

const billStatusColor: Record<string, string> = {
    OPEN: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    PAID: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    OVERDUE: 'border-red-500/30 bg-red-500/10 text-red-400',
    CANCELED: 'border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400',
};

const periodCards: {
    key: PeriodKey;
    label: string;
    icon: typeof AlertTriangle;
    activeClass: string;
}[] = [
    {
        key: 'OVERDUE',
        label: 'Vencidas',
        icon: AlertTriangle,
        activeClass: 'border-red-500 bg-red-500/10 text-red-500',
    },
    {
        key: 'TODAY',
        label: 'Hoje',
        icon: Clock,
        activeClass: 'border-orange-500 bg-orange-500/10 text-orange-500',
    },
    {
        key: 'WEEK',
        label: 'Esta semana',
        icon: CalendarDays,
        activeClass: 'border-cyan-500 bg-cyan-500/10 text-cyan-500',
    },
    {
        key: 'MONTH',
        label: 'Este mês',
        icon: Calendar,
        activeClass: 'border-purple-500 bg-purple-500/10 text-purple-500',
    },
    {
        key: 'ALL',
        label: 'Em aberto',
        icon: Wallet,
        activeClass: 'border-blue-500 bg-blue-500/10 text-blue-500',
    },
];

function formatCurrency(value: string | number) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) {
        return '-';
    }

    return new Date(value).toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
    });
}

function normalizeDate(value: string) {
    const date = new Date(value);

    return new Date(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
    );
}

function startOfToday() {
    const date = new Date();

    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );
}

function endOfToday() {
    const date = startOfToday();

    date.setHours(23, 59, 59, 999);

    return date;
}

function startOfCurrentMonth() {
    const date = new Date();

    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfCurrentMonth() {
    const date = new Date();

    return new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
    );
}

function endOfRollingWeek() {
    const date = startOfToday();

    date.setDate(date.getDate() + 6);
    date.setHours(23, 59, 59, 999);

    return date;
}

type PeriodKey = 'OVERDUE' | 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

// Janelas por vencimento que espelham exatamente os buckets calculados no
// Dashboard Financeiro (financial-dashboard.service.ts) — semana de
// segunda a domingo (não "rolling") e mês corrido completo (não só daqui
// pra frente). Usadas só quando a página chega via link do dashboard
// (?period=...&paid=...), pra que o clique mostre exatamente as contas
// que compõem o número que a pessoa clicou.
type DashboardPeriod = 'HOJE' | 'SEMANA' | 'MES' | 'VENCIDAS';
type DashboardPaid = 'PAGAS' | 'APAGAR';

function startOfThisWeekMonday() {
    const today = startOfToday();
    const weekday = today.getDay(); // 0 = domingo
    const diffToMonday = weekday === 0 ? 6 : weekday - 1;

    const start = new Date(today);
    start.setDate(start.getDate() - diffToMonday);
    return start;
}

function dashboardPeriodRange(
    period: DashboardPeriod,
): { gte: Date; lt: Date } | null {
    if (period === 'HOJE') {
        const start = startOfToday();
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { gte: start, lt: end };
    }

    if (period === 'SEMANA') {
        const start = startOfThisWeekMonday();
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        return { gte: start, lt: end };
    }

    if (period === 'MES') {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { gte: start, lt: end };
    }

    return null;
}

const dashboardPeriodLabel: Record<DashboardPeriod, string> = {
    HOJE: 'hoje',
    SEMANA: 'esta semana',
    MES: 'este mês',
    VENCIDAS: 'vencidas',
};

const dashboardPaidLabel: Record<DashboardPaid, string> = {
    PAGAS: 'pagas',
    APAGAR: 'a pagar',
};

// Os cards de período são a forma principal de enxergar o que está em
// aberto — "hoje", "esta semana" e "este mês" são janelas que começam
// hoje (não incluem o que já venceu, que tem card próprio). Exceção: uma
// vencida que a pessoa marcou manualmente com "Incluir em hoje"
// (queuedForPaymentAt) entra também no card "Hoje" — ela continua
// vencida (badge/selo não muda), só passa a contar junto do que precisa
// ser pago hoje na prática.
function matchesPeriod(bill: Bill, period: PeriodKey): boolean {
    const displayStatus = getDisplayStatus(bill);

    if (period === 'OVERDUE') {
        return displayStatus === 'OVERDUE';
    }

    if (
        period === 'TODAY' &&
        displayStatus === 'OVERDUE' &&
        bill.queuedForPaymentAt
    ) {
        return true;
    }

    if (displayStatus !== 'OPEN') {
        return false;
    }

    if (period === 'ALL') {
        return true;
    }

    const dueDate = normalizeDate(bill.dueDate);
    const today = startOfToday();

    if (period === 'TODAY') {
        return dueDate >= today && dueDate <= endOfToday();
    }

    if (period === 'WEEK') {
        return dueDate >= today && dueDate <= endOfRollingWeek();
    }

    return dueDate >= today && dueDate <= endOfCurrentMonth();
}

function getDisplayStatus(bill: Bill) {
    if (
        bill.status === 'OPEN' &&
        normalizeDate(bill.dueDate) < startOfToday()
    ) {
        return 'OVERDUE';
    }

    return bill.status;
}

function getDueDateMessage(bill: Bill) {
    const status = getDisplayStatus(bill);

    if (status === 'PAID') {
        return bill.paidAt
            ? `Pago em ${formatDate(bill.paidAt)}`
            : 'Conta paga';
    }

    if (status === 'CANCELED') {
        return 'Conta cancelada';
    }

    const today = startOfToday();
    const dueDate = normalizeDate(bill.dueDate);

    const differenceInDays = Math.round(
        (dueDate.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (differenceInDays < 0) {
        const days = Math.abs(differenceInDays);

        return `Vencida há ${days} dia${days === 1 ? '' : 's'}`;
    }

    if (differenceInDays === 0) {
        return 'Vence hoje';
    }

    if (differenceInDays === 1) {
        return 'Vence amanhã';
    }

    return `Vence em ${differenceInDays} dias`;
}

export default function BillsPage() {
    return (
        <Suspense
            fallback={
                <div className="p-6 text-sm text-zinc-500">
                    Carregando...
                </div>
            }
        >
            <BillsPageInner />
        </Suspense>
    );
}

function BillsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Filtro vindo de um link do Dashboard Financeiro. Quando presente,
    // ele manda na lista final — os cards de período normais continuam
    // visíveis, mas clicar em qualquer um deles ou em "Limpar filtro"
    // remove esses parâmetros da URL e volta pro comportamento normal.
    const dashboardPeriod = searchParams.get(
        'period',
    ) as DashboardPeriod | null;
    const dashboardPaid = searchParams.get('paid') as DashboardPaid | null;
    const billIdFilter = searchParams.get('billId');
    const hasDashboardFilter = Boolean(dashboardPeriod || billIdFilter);

    function clearDashboardFilter() {
        router.replace('/bills');
    }

    const [bills, setBills] = useState<Bill[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);

    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(
        null,
    );

    const [search, setSearch] = useState('');
    const [periodFilter, setPeriodFilter] = useState<PeriodKey>('ALL');
    const [statusFilter, setStatusFilter] = useState('');
    const [supplierFilter, setSupplierFilter] = useState('');
    const [paymentMethodFilter, setPaymentMethodFilter] =
        useState('');
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(
        new Set(),
    );
    const [downloadingReport, setDownloadingReport] = useState(false);
    const [queuingAllOverdue, setQueuingAllOverdue] = useState(false);

    const currentUser = getUser();
    const podeGerenciarLote = canManagePaymentBatch(currentUser);

    const [showBatchConfig, setShowBatchConfig] = useState(false);
    const [generatingBatch, setGeneratingBatch] = useState(false);
    const [batchSummary, setBatchSummary] = useState<{
        totalBoletos: number;
        totalPix: number;
        ignoradas: { id: string; description: string; motivo: string }[];
    } | null>(null);

    function toggleExpanded(id: string) {
        setExpandedIds((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    async function loadBaseData() {
        try {
            const response = await api.get('/suppliers');
            setSuppliers(response.data || []);
        } catch {
            toast.error('Erro ao carregar fornecedores.');
        }
    }

    async function loadBills() {
        try {
            setLoading(true);

            // A loja é a que está ativa lá em cima — cada loja só vê as
            // próprias contas aqui.
            const response = await api.get('/bills', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    supplierId: supplierFilter || undefined,
                },
            });

            setBills(response.data || []);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao carregar contas a pagar.';

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
        loadBaseData();
    }, []);

    useEffect(() => {
        loadBills();
    }, [supplierFilter]);

    function clearFilters() {
        setSearch('');
        setPeriodFilter('ALL');
        setStatusFilter('');
        setSupplierFilter('');
        setPaymentMethodFilter('');
    }

    function selectPeriod(period: PeriodKey) {
        if (hasDashboardFilter) {
            router.replace('/bills');
        }

        setPeriodFilter(period);
        setStatusFilter('');
    }

    // Filtros que não dependem do período (busca e forma de pagamento) —
    // usados tanto na lista final quanto na contagem de cada card.
    const searchedBills = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();

        return bills.filter((bill) => {
            if (
                paymentMethodFilter &&
                bill.paymentMethod !== paymentMethodFilter
            ) {
                return false;
            }

            if (normalizedSearch) {
                const searchableText = [
                    bill.description,
                    bill.store?.name,
                    bill.supplier?.name,
                    bill.purchase?.description,
                    bill.barcode,
                    bill.pixKey,
                    bill.beneficiary,
                    bill.bankName,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (
                    !searchableText.includes(normalizedSearch)
                ) {
                    return false;
                }
            }

            return true;
        });
    }, [bills, search, paymentMethodFilter]);

    const periodTotals = useMemo(() => {
        const periods: PeriodKey[] = [
            'OVERDUE',
            'TODAY',
            'WEEK',
            'MONTH',
            'ALL',
        ];

        const result: Record<PeriodKey, { count: number; value: number }> =
        {
            OVERDUE: { count: 0, value: 0 },
            TODAY: { count: 0, value: 0 },
            WEEK: { count: 0, value: 0 },
            MONTH: { count: 0, value: 0 },
            ALL: { count: 0, value: 0 },
        };

        for (const bill of searchedBills) {
            const value = Number(bill.value);

            for (const period of periods) {
                if (matchesPeriod(bill, period)) {
                    result[period].count += 1;
                    result[period].value += value;
                }
            }
        }

        return result;
    }, [searchedBills]);

    // A situação (pagas/canceladas) e o período de vencimento não fazem
    // sentido juntos — escolher uma situação manual ignora o card de
    // período selecionado.
    const filteredBills = useMemo(() => {
        if (billIdFilter) {
            return searchedBills.filter((bill) => bill.id === billIdFilter);
        }

        if (dashboardPeriod) {
            return searchedBills.filter((bill) => {
                const status = getDisplayStatus(bill);

                if (dashboardPeriod === 'VENCIDAS') {
                    return status === 'OVERDUE';
                }

                const range = dashboardPeriodRange(dashboardPeriod);

                if (!range) {
                    return false;
                }

                const dueDate = normalizeDate(bill.dueDate);

                if (dueDate < range.gte || dueDate >= range.lt) {
                    return false;
                }

                if (dashboardPaid === 'PAGAS') {
                    return status === 'PAID';
                }

                if (dashboardPaid === 'APAGAR') {
                    return status === 'OPEN' || status === 'OVERDUE';
                }

                return true;
            });
        }

        return searchedBills.filter((bill) => {
            if (statusFilter) {
                return getDisplayStatus(bill) === statusFilter;
            }

            return matchesPeriod(bill, periodFilter);
        });
    }, [
        searchedBills,
        statusFilter,
        periodFilter,
        dashboardPeriod,
        dashboardPaid,
        billIdFilter,
    ]);

    async function copyText(
        value: string | null | undefined,
        successMessage: string,
    ) {
        if (!value) {
            toast.error('Informação não cadastrada.');
            return;
        }

        try {
            await navigator.clipboard.writeText(value);

            toast.success(successMessage);
        } catch {
            toast.error(
                'Não foi possível copiar automaticamente.',
            );
        }
    }

    async function markAsPaid(bill: Bill) {
        const confirmed = window.confirm(
            `Marcar "${bill.description}" como paga?`,
        );

        if (!confirmed) {
            return;
        }

        try {
            setProcessingId(bill.id);

            await api.patch(`/bills/${bill.id}/pay`, {});

            toast.success('Conta marcada como paga.');
            await loadBills();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao marcar conta como paga.',
            );
        } finally {
            setProcessingId(null);
        }
    }

    async function cancelBill(bill: Bill) {
        const confirmed = window.confirm(
            `Cancelar a conta "${bill.description}"?`,
        );

        if (!confirmed) {
            return;
        }

        try {
            setProcessingId(bill.id);

            await api.delete(`/bills/${bill.id}`);

            toast.success('Conta cancelada.');
            await loadBills();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao cancelar conta.',
            );
        } finally {
            setProcessingId(null);
        }
    }

    async function toggleQueueToday(bill: Bill) {
        try {
            setProcessingId(bill.id);

            await api.patch(`/bills/${bill.id}/queue-today`, {});

            toast.success(
                bill.queuedForPaymentAt
                    ? 'Conta removida dos pagamentos de hoje.'
                    : 'Conta incluída nos pagamentos de hoje.',
            );
            await loadBills();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao atualizar a conta.',
            );
        } finally {
            setProcessingId(null);
        }
    }

    async function queueAllOverdueToday() {
        try {
            setQueuingAllOverdue(true);

            const response = await api.patch('/bills/queue-today/overdue', {
                storeId: getActiveStore()?.id || undefined,
            });

            const total = response.data?.total ?? 0;

            toast.success(
                total > 0
                    ? `${total} conta(s) vencida(s) incluída(s) nos pagamentos de hoje.`
                    : 'Nenhuma conta vencida pra incluir — já estavam todas marcadas.',
            );
            await loadBills();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao incluir as vencidas nos pagamentos de hoje.',
            );
        } finally {
            setQueuingAllOverdue(false);
        }
    }

    async function downloadTodayReport() {
        try {
            setDownloadingReport(true);

            const response = await api.get('/bills/report/today', {
                params: { storeId: getActiveStore()?.id || undefined },
                responseType: 'blob',
            });

            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data]),
            );

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `contas-a-pagar-${new Date()
                .toISOString()
                .slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch (error: any) {
            let message = 'Erro ao gerar o relatório do dia.';
            const data = error?.response?.data;

            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    const parsed = JSON.parse(text);
                    message = Array.isArray(parsed?.message)
                        ? parsed.message.join(', ')
                        : parsed?.message || message;
                } catch {
                    // mantém a mensagem padrão
                }
            }

            toast.error(message);
        } finally {
            setDownloadingReport(false);
        }
    }

    async function generateBatchPayment() {
        try {
            setGeneratingBatch(true);

            const response = await api.get('/bills/batch-payment/generate', {
                responseType: 'blob',
            });

            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data]),
            );

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `cnab240-sicredi-${new Date()
                .toISOString()
                .slice(0, 10)}.txt`;
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);

            const summaryHeader = response.headers?.['x-batch-summary'];

            if (summaryHeader) {
                try {
                    setBatchSummary(
                        JSON.parse(decodeURIComponent(summaryHeader)),
                    );
                } catch {
                    // sem resumo, mas o arquivo já baixou — segue o jogo
                }
            }
        } catch (error: any) {
            let message = 'Erro ao gerar o lançamento em lote.';
            const data = error?.response?.data;

            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    const parsed = JSON.parse(text);
                    message = Array.isArray(parsed?.message)
                        ? parsed.message.join(', ')
                        : parsed?.message || message;
                } catch {
                    // mantém a mensagem padrão
                }
            }

            toast.error(message);
        } finally {
            setGeneratingBatch(false);
        }
    }

    return (
        <AppLayout title="Contas a Pagar">
            <div className="space-y-6">
                <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">
                            Contas a Pagar
                        </h2>

                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Controle vencimentos, PIX, boletos
                            e cartões.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {podeGerenciarLote && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowBatchConfig(true)}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    title="Configurar convênio Sicredi"
                                >
                                    <Settings size={18} />
                                </button>

                                <button
                                    type="button"
                                    onClick={generateBatchPayment}
                                    disabled={generatingBatch}
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                                >
                                    <Banknote size={18} />
                                    {generatingBatch
                                        ? 'Gerando...'
                                        : 'Gerar lançamento em lote'}
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={downloadTodayReport}
                            disabled={downloadingReport}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                        >
                            <Download size={18} />
                            {downloadingReport
                                ? 'Gerando...'
                                : 'Relatório do dia'}
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push('/bills/reconcile')}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-5 py-3 font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            <Landmark size={18} />
                            Conciliação bancária
                        </button>

                        <button
                            type="button"
                            onClick={() => router.push('/bills/new')}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
                        >
                            <Plus size={18} />
                            Nova conta
                        </button>
                    </div>
                </header>

                {hasDashboardFilter && (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4 dark:bg-cyan-500/[0.06]">
                        <p className="text-sm text-cyan-600 dark:text-cyan-400">
                            {billIdFilter
                                ? 'Mostrando a conta selecionada no Dashboard Financeiro.'
                                : `Filtro do Dashboard Financeiro: contas ${dashboardPaid
                                    ? dashboardPaidLabel[dashboardPaid]
                                    : ''
                                } com vencimento ${dashboardPeriod
                                    ? dashboardPeriodLabel[dashboardPeriod]
                                    : ''
                                }.`}
                        </p>

                        <button
                            type="button"
                            onClick={clearDashboardFilter}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 px-3 py-1.5 text-sm font-medium text-cyan-600 hover:bg-cyan-500/10 dark:text-cyan-400"
                        >
                            <X size={14} />
                            Limpar filtro
                        </button>
                    </section>
                )}

                <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                    {periodCards.map((card) => {
                        const Icon = card.icon;
                        const isActive =
                            periodFilter === card.key && !statusFilter;
                        const stats = periodTotals[card.key];

                        return (
                            <button
                                key={card.key}
                                onClick={() => selectPeriod(card.key)}
                                className={`flex flex-col gap-1 rounded-3xl border p-4 text-left transition ${isActive
                                    ? card.activeClass
                                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <Icon size={18} />
                                    <span className="text-xl font-bold">
                                        {stats.count}
                                    </span>
                                </div>

                                <p className="text-sm">{card.label}</p>
                                <p className="text-xs opacity-80">
                                    {formatCurrency(stats.value)}
                                </p>
                            </button>
                        );
                    })}
                </section>

                {periodTotals.OVERDUE.count > 0 && (
                    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 dark:bg-red-500/[0.06]">
                        <p className="text-sm text-red-600 dark:text-red-400">
                            {periodTotals.OVERDUE.count} conta(s) vencida(s)
                            no total — inclua todas de uma vez nos
                            pagamentos de hoje, ou use o botão individual
                            de cada conta na lista abaixo.
                        </p>

                        <button
                            type="button"
                            onClick={queueAllOverdueToday}
                            disabled={queuingAllOverdue}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                            <Clock size={14} />
                            {queuingAllOverdue
                                ? 'Incluindo...'
                                : 'Colocar todas vencidas para hoje'}
                        </button>
                    </section>
                )}

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <Search
                                size={17}
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
                            />

                            <input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Buscar descrição, fornecedor, PIX, boleto..."
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 pl-11 pr-4 outline-none focus:border-blue-500"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setShowMoreFilters((current) => !current)
                            }
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            <SlidersHorizontal size={16} />
                            Mais filtros
                        </button>
                    </div>

                    {showMoreFilters && (
                        <div className="mt-4 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <select
                                    value={statusFilter}
                                    onChange={(event) =>
                                        setStatusFilter(event.target.value)
                                    }
                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-blue-500"
                                >
                                    <option value="">
                                        Usar cards de vencimento acima
                                    </option>
                                    <option value="PAID">Ver pagas</option>
                                    <option value="CANCELED">
                                        Ver canceladas
                                    </option>
                                </select>

                                <select
                                    value={paymentMethodFilter}
                                    onChange={(event) =>
                                        setPaymentMethodFilter(
                                            event.target.value,
                                        )
                                    }
                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-blue-500"
                                >
                                    <option value="">
                                        Todas as formas
                                    </option>
                                    <option value="BANK_SLIP">
                                        Boleto
                                    </option>
                                    <option value="PIX">PIX</option>
                                    <option value="CREDIT_CARD">
                                        Cartão de crédito
                                    </option>
                                    <option value="DEBIT_CARD">
                                        Cartão de débito
                                    </option>
                                    <option value="CASH">
                                        Dinheiro
                                    </option>
                                    <option value="FLASH">
                                        Flash
                                    </option>
                                    <option value="BANK_TRANSFER">
                                        Transferência
                                    </option>
                                    <option value="COMPANY_ACCOUNT">
                                        Conta da empresa
                                    </option>
                                </select>

                                <div className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3">
                                    <AutocompleteInput
                                        options={suppliers.map((supplier) => ({
                                            id: supplier.id,
                                            nome: supplier.name,
                                        }))}
                                        value={supplierFilter}
                                        onChange={setSupplierFilter}
                                        placeholder="Todos os fornecedores"
                                        className="h-full w-full bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                                    />
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={clearFilters}
                                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                            >
                                Limpar filtros
                            </button>
                        </div>
                    )}
                </section>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-5 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold">
                                Contas cadastradas
                            </h3>

                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                {filteredBills.length} conta(s)
                                encontrada(s)
                            </p>
                        </div>

                        <Wallet className="text-cyan-400" />
                    </div>

                    {loading ? (
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Carregando contas...
                        </p>
                    ) : filteredBills.length === 0 ? (
                        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
                            <ReceiptText className="mx-auto mb-3 text-zinc-600" />

                            <p className="text-zinc-600 dark:text-zinc-400">
                                Nenhuma conta encontrada.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredBills.map((bill) => (
                                <BillRow
                                    key={bill.id}
                                    bill={bill}
                                    processing={
                                        processingId === bill.id
                                    }
                                    expanded={expandedIds.has(bill.id)}
                                    onToggleExpanded={() =>
                                        toggleExpanded(bill.id)
                                    }
                                    onCopy={copyText}
                                    onPay={markAsPaid}
                                    onCancel={cancelBill}
                                    onToggleQueueToday={toggleQueueToday}
                                    onOpenPurchase={(purchaseId) =>
                                        router.push(
                                            `/purchases/${purchaseId}`,
                                        )
                                    }
                                    onSaved={loadBills}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {showBatchConfig && (
                <BatchPaymentModal onClose={() => setShowBatchConfig(false)} />
            )}

            {batchSummary && (
                <BatchPaymentSummaryModal
                    resumo={batchSummary}
                    onClose={() => setBatchSummary(null)}
                />
            )}
        </AppLayout>
    );
}

function BillRow({
    bill,
    processing,
    expanded,
    onToggleExpanded,
    onCopy,
    onPay,
    onCancel,
    onToggleQueueToday,
    onOpenPurchase,
    onSaved,
}: {
    bill: Bill;
    processing: boolean;
    expanded: boolean;
    onToggleExpanded: () => void;

    onCopy: (
        value: string | null | undefined,
        message: string,
    ) => Promise<void>;

    onPay: (bill: Bill) => Promise<void>;
    onCancel: (bill: Bill) => Promise<void>;
    onToggleQueueToday: (bill: Bill) => Promise<void>;
    onOpenPurchase: (purchaseId: string) => void;
    onSaved: () => Promise<void>;
}) {
    const displayStatus = getDisplayStatus(bill);
    const isInactive =
        displayStatus === 'PAID' ||
        displayStatus === 'CANCELED';

    // Edição da forma de pagamento (boleto/PIX/dados bancários) direto no
    // card — antes só dava pra ver, não pra corrigir/completar depois que
    // a conta já tinha sido criada.
    const [editingPayment, setEditingPayment] = useState(false);

    return (
        <article
            className={`overflow-hidden rounded-2xl border ${displayStatus === 'OVERDUE'
                ? 'border-red-500/30 bg-red-500/[0.04]'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                }`}
        >
            <button
                type="button"
                onClick={onToggleExpanded}
                className="flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:gap-4"
            >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="hidden shrink-0 rounded-xl bg-cyan-500/10 p-2 text-cyan-400 sm:block">
                        <ReceiptText size={18} />
                    </div>

                    <div className="min-w-0">
                        <p className="truncate font-semibold">
                            {bill.supplier?.name ||
                                bill.description}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                            {bill.description}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${billStatusColor[displayStatus] ||
                            billStatusColor.OPEN
                            }`}
                    >
                        {billStatusLabel[displayStatus] ||
                            displayStatus}
                    </span>

                    {bill.queuedForPaymentAt &&
                        displayStatus === 'OVERDUE' && (
                            <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-500">
                                Nos pagamentos de hoje
                            </span>
                        )}
                </div>

                <div className="shrink-0 text-left sm:w-32 sm:text-right">
                    <p className="text-xs text-zinc-500">
                        Vencimento
                    </p>
                    <p
                        className={`text-sm font-medium ${displayStatus === 'OVERDUE'
                            ? 'text-red-500'
                            : ''
                            }`}
                    >
                        {formatDate(bill.dueDate)}
                    </p>
                </div>

                <div className="shrink-0 text-left sm:w-36 sm:text-right">
                    <p className="text-lg font-bold text-cyan-500">
                        {formatCurrency(bill.value)}
                    </p>
                </div>

                <div className="shrink-0 text-zinc-400">
                    {expanded ? (
                        <ChevronUp size={18} />
                    ) : (
                        <ChevronDown size={18} />
                    )}
                </div>
            </button>

            {displayStatus === 'OVERDUE' && (
                <div className="px-4 pb-3 sm:px-4">
                    <button
                        type="button"
                        disabled={processing}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleQueueToday(bill);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-500 hover:bg-orange-500/20 disabled:opacity-50"
                    >
                        <Clock size={13} />
                        {bill.queuedForPaymentAt
                            ? 'Remover dos pagamentos de hoje'
                            : 'Incluir nos pagamentos de hoje'}
                    </button>
                </div>
            )}

            {expanded && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                            {paymentMethodLabel[
                                bill.paymentMethod
                            ] ||
                                billTypeLabel[bill.type] ||
                                bill.paymentMethod}
                        </span>

                        {!isInactive && !editingPayment && (
                            <button
                                type="button"
                                onClick={() => setEditingPayment(true)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <Pencil size={12} />
                                Editar forma de pagamento
                            </button>
                        )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InformationCard
                            icon={Building2}
                            label="Loja"
                            value={bill.store.name}
                        />

                        <InformationCard
                            icon={Landmark}
                            label="Fornecedor"
                            value={
                                bill.supplier?.name ||
                                'Não informado'
                            }
                        />

                        <InformationCard
                            icon={ReceiptText}
                            label="Vencimento"
                            value={formatDate(bill.dueDate)}
                            secondary={getDueDateMessage(bill)}
                            danger={
                                displayStatus === 'OVERDUE'
                            }
                        />
                    </div>

                    {bill.purchase && (
                        <button
                            type="button"
                            onClick={() =>
                                onOpenPurchase(
                                    bill.purchase!.id,
                                )
                            }
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-400 hover:bg-blue-500/20"
                        >
                            <ExternalLink size={16} />
                            Abrir compra:{' '}
                            {bill.purchase.description}
                        </button>
                    )}

                    {editingPayment ? (
                        <PaymentEditForm
                            bill={bill}
                            onCancel={() => setEditingPayment(false)}
                            onSaved={async () => {
                                setEditingPayment(false);
                                await onSaved();
                            }}
                        />
                    ) : (
                        <PaymentDetails
                            bill={bill}
                            onCopy={onCopy}
                        />
                    )}

                    {bill.notes && (
                        <div className="mt-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                            <p className="text-xs text-zinc-500">
                                Observações
                            </p>

                            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
                                {bill.notes}
                            </p>
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        {bill.fileUrl && (
                            <a
                                href={`${API_URL}${bill.fileUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-400 hover:bg-purple-500/20"
                            >
                                <FileText size={16} />
                                Abrir documento
                            </a>
                        )}

                        {bill.paymentProofUrl && (
                            <a
                                href={`${API_URL}${bill.paymentProofUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/20"
                            >
                                <CheckCircle2 size={16} />
                                Abrir comprovante
                            </a>
                        )}

                    </div>

                    <p className="mt-3 text-xs text-zinc-600">
                        Cadastrada por {bill.launchedBy.name} em{' '}
                        {formatDate(bill.createdAt)}
                    </p>

                    {bill.paidAt && (
                        <p className="mt-1 text-xs text-blue-400">
                            Pago em {formatDate(bill.paidAt)}
                        </p>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2">
                        {!isInactive && (
                            <button
                                type="button"
                                disabled={processing}
                                onClick={() => onPay(bill)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                <Check size={17} />
                                Marcar como paga
                            </button>
                        )}

                        {displayStatus !== 'CANCELED' && (
                            <button
                                type="button"
                                disabled={processing}
                                onClick={() =>
                                    onCancel(bill)
                                }
                                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            >
                                Cancelar conta
                            </button>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}

// Formulário de edição da forma de pagamento (boleto/PIX/transferência)
// direto no card já expandido — reaproveita o PUT /bills/:id, que já
// aceita todos esses campos (o que faltava era só a tela). Pensado pra
// quando a conta nasceu "sem boleto" e o boleto/chave chegou depois, ou
// pra corrigir um dado digitado errado sem precisar excluir e recriar a
// conta inteira.
function PaymentEditForm({
    bill,
    onCancel,
    onSaved,
}: {
    bill: Bill;
    onCancel: () => void;
    onSaved: () => Promise<void>;
}) {
    const [paymentMethod, setPaymentMethod] = useState(bill.paymentMethod);
    const [barcode, setBarcode] = useState(bill.barcode || '');
    const [pixKey, setPixKey] = useState(bill.pixKey || '');
    const [pixKeyType, setPixKeyType] = useState(bill.pixKeyType || '');
    const [pixQrCode, setPixQrCode] = useState(bill.pixQrCode || '');
    const [bankName, setBankName] = useState(bill.bankName || '');
    const [bankAgency, setBankAgency] = useState(bill.bankAgency || '');
    const [bankAccount, setBankAccount] = useState(bill.bankAccount || '');
    const [beneficiary, setBeneficiary] = useState(bill.beneficiary || '');
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        try {
            setSaving(true);

            await api.put(`/bills/${bill.id}`, {
                paymentMethod,
                barcode: barcode || undefined,
                pixKey: pixKey || undefined,
                pixKeyType: pixKeyType || undefined,
                pixQrCode: pixQrCode || undefined,
                bankName: bankName || undefined,
                bankAgency: bankAgency || undefined,
                bankAccount: bankAccount || undefined,
                beneficiary: beneficiary || undefined,
            });

            toast.success('Forma de pagamento atualizada.');
            await onSaved();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar forma de pagamento.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mt-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
            <p className="mb-3 text-sm font-semibold">
                Editar forma de pagamento
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-500">
                    Forma de pagamento
                    <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                    >
                        {Object.entries(paymentMethodLabel).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
            </div>

            {paymentMethod === 'BANK_SLIP' && (
                <label className="mt-3 block text-xs text-zinc-500">
                    Código de barras / linha digitável
                    <input
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Cole aqui o código do boleto"
                        className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 font-mono text-sm outline-none focus:border-blue-500"
                    />
                </label>
            )}

            {paymentMethod === 'PIX' && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="text-xs text-zinc-500">
                        Chave PIX
                        <input
                            value={pixKey}
                            onChange={(e) => setPixKey(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>

                    <label className="text-xs text-zinc-500">
                        Tipo da chave
                        <select
                            value={pixKeyType}
                            onChange={(e) => setPixKeyType(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        >
                            <option value="">Não informado</option>
                            {Object.entries(pixKeyTypeLabel).map(
                                ([value, label]) => (
                                    <option key={value} value={value}>
                                        {label}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>

                    <label className="text-xs text-zinc-500 sm:col-span-2">
                        PIX copia e cola (opcional)
                        <textarea
                            value={pixQrCode}
                            onChange={(e) => setPixQrCode(e.target.value)}
                            rows={2}
                            className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 font-mono text-xs outline-none focus:border-blue-500"
                        />
                    </label>
                </div>
            )}

            {paymentMethod === 'BANK_TRANSFER' && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="text-xs text-zinc-500">
                        Banco
                        <input
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>

                    <label className="text-xs text-zinc-500">
                        Agência
                        <input
                            value={bankAgency}
                            onChange={(e) => setBankAgency(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>

                    <label className="text-xs text-zinc-500">
                        Conta
                        <input
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>

                    <label className="text-xs text-zinc-500">
                        Favorecido
                        <input
                            value={beneficiary}
                            onChange={(e) => setBeneficiary(e.target.value)}
                            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    </label>
                </div>
            )}

            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
}

function PaymentDetails({
    bill,
    onCopy,
}: {
    bill: Bill;

    onCopy: (
        value: string | null | undefined,
        message: string,
    ) => Promise<void>;
}) {
    if (bill.paymentMethod === 'BANK_SLIP') {
        return (
            <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                <p className="text-xs text-yellow-300">
                    Código de barras / linha digitável
                </p>

                {bill.barcode ? (
                    <>
                        <p className="mt-2 break-all font-mono text-sm text-yellow-100">
                            {bill.barcode}
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                onCopy(
                                    bill.barcode,
                                    'Código de barras copiado.',
                                )
                            }
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-yellow-500/30 px-3 py-2 text-sm text-yellow-400 hover:bg-yellow-500/10"
                        >
                            <ClipboardCopy size={16} />
                            Copiar código
                        </button>
                    </>
                ) : (
                    <p className="mt-1 text-sm text-yellow-400/70">
                        Código não cadastrado. Consulte o arquivo
                        anexado.
                    </p>
                )}
            </div>
        );
    }

    if (bill.paymentMethod === 'PIX') {
        return (
            <div className="mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 p-4">
                <p className="text-sm font-semibold text-purple-300">
                    Dados para pagamento via PIX
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {bill.pixKey && (
                        <div className="rounded-xl border border-purple-500/20 bg-zinc-50 dark:bg-zinc-950/50 p-3">
                            <p className="text-xs text-zinc-500">
                                Chave PIX
                                {bill.pixKeyType
                                    ? ` • ${pixKeyTypeLabel[
                                    bill.pixKeyType
                                    ] ||
                                    bill.pixKeyType
                                    }`
                                    : ''}
                            </p>

                            <p className="mt-1 break-all text-sm">
                                {bill.pixKey}
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    onCopy(
                                        bill.pixKey,
                                        'Chave PIX copiada.',
                                    )
                                }
                                className="mt-2 inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                            >
                                <ClipboardCopy size={15} />
                                Copiar chave
                            </button>
                        </div>
                    )}

                    {bill.beneficiary && (
                        <div className="rounded-xl border border-purple-500/20 bg-zinc-50 dark:bg-zinc-950/50 p-3">
                            <p className="text-xs text-zinc-500">
                                Favorecido
                            </p>

                            <p className="mt-1 text-sm">
                                {bill.beneficiary}
                            </p>
                        </div>
                    )}
                </div>

                {bill.pixQrCode && (
                    <div className="mt-3 rounded-xl border border-purple-500/20 bg-zinc-50 dark:bg-zinc-950/50 p-3">
                        <p className="text-xs text-zinc-500">
                            PIX copia e cola
                        </p>

                        <p className="mt-1 line-clamp-2 break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                            {bill.pixQrCode}
                        </p>

                        <button
                            type="button"
                            onClick={() =>
                                onCopy(
                                    bill.pixQrCode,
                                    'PIX copia e cola copiado.',
                                )
                            }
                            className="mt-2 inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300"
                        >
                            <ClipboardCopy size={15} />
                            Copiar PIX copia e cola
                        </button>
                    </div>
                )}

                {!bill.pixKey && !bill.pixQrCode && (
                    <p className="mt-2 text-sm text-purple-400/70">
                        Nenhuma chave ou código PIX foi
                        cadastrado.
                    </p>
                )}
            </div>
        );
    }

    if (bill.paymentMethod === 'BANK_TRANSFER') {
        return (
            <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                <p className="text-sm font-semibold text-blue-300">
                    Dados bancários
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <BankInformation
                        title="Banco"
                        value={bill.bankName}
                    />

                    <BankInformation
                        title="Agência"
                        value={bill.bankAgency}
                    />

                    <BankInformation
                        title="Conta"
                        value={bill.bankAccount}
                    />

                    <BankInformation
                        title="Favorecido"
                        value={bill.beneficiary}
                    />
                </div>
            </div>
        );
    }

    if (
        ['CREDIT_CARD', 'DEBIT_CARD'].includes(
            bill.paymentMethod,
        )
    ) {
        return (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                <CreditCard className="text-blue-400" />

                <div>
                    <p className="text-sm font-semibold text-blue-300">
                        Pagamento em cartão
                    </p>

                    <p className="text-sm text-blue-400/70">
                        Esta conta deve ser conferida junto à
                        fatura do cartão.
                    </p>
                </div>
            </div>
        );
    }

    return null;
}

function BankInformation({
    title,
    value,
}: {
    title: string;
    value?: string | null;
}) {
    return (
        <div className="rounded-xl border border-blue-500/20 bg-zinc-50 dark:bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">{title}</p>

            <p className="mt-1 text-sm">
                {value || 'Não informado'}
            </p>
        </div>
    );
}

function InformationCard({
    icon: Icon,
    label,
    value,
    secondary,
    danger = false,
}: {
    icon: React.ComponentType<{
        size?: number;
        className?: string;
    }>;

    label: string;
    value: string;
    secondary?: string;
    danger?: boolean;
}) {
    return (
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
            <Icon
                size={18}
                className={
                    danger
                        ? 'mt-0.5 text-red-400'
                        : 'mt-0.5 text-zinc-500'
                }
            />

            <div>
                <p className="text-xs text-zinc-500">{label}</p>

                <p className="mt-1 text-sm font-medium">{value}</p>

                {secondary && (
                    <p
                        className={`mt-1 text-xs ${danger
                            ? 'text-red-400'
                            : 'text-zinc-500'
                            }`}
                    >
                        {secondary}
                    </p>
                )}
            </div>
        </div>
    );
}

