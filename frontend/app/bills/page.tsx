'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    CloudDownload,
    Link2,
    Banknote,
    Building2,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
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
    Printer,
    ReceiptText,
    Settings,
    Tag,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { AutocompleteInput } from '../../src/components/ui/AutocompleteInput';
import { api, API_URL, arquivoUrl } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { canManagePaymentBatch, getUser } from '@/lib/auth';
import {
    BatchPaymentModal,
    BatchPaymentSummaryModal,
} from '../../src/components/bills/BatchPaymentModal';
import {
    BILL_CATEGORY_GROUPS,
    BillCategorySelect,
    OTHER_GROUP,
    groupInfo,
    useBillCategories,
    type BillCategory,
    type BillCategoryGroup,
} from '../../src/components/bills/BillCategorySelect';
import { AbasContas } from '../../src/components/bills/AbasContas';
import { NfChip, NfVinculoModal } from '../../src/components/bills/NfDaConta';
import { MoneyInput } from '../../src/components/ui/MoneyInput';

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
    // Vencimento do documento quando caía em fim de semana/feriado (o
    // dueDate já foi empurrado pro próximo dia útil).
    dueDateOriginal?: string | null;
    // NF do sistema ligada à conta.
    nfEntrada?: { id: string; chaveAcesso: string; issuerName?: string | null; value?: string | number | null; issueDate?: string | null } | null;
    nfServico?: { id: string; chaveAcesso: string; numeroNf?: string | null; issuerName?: string | null; value?: string | number | null; issueDate?: string | null } | null;
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
    recorrenciaId?: string | null;
    createdAt: string;

    store: Store;
    supplier?: Supplier | null;
    purchase?: Purchase | null;
    category?: BillCategory | null;

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

// Situação da lista (chips abaixo da busca) — igual ao Rota.
type Situacao = 'OPEN' | 'PAID' | 'ALL';

const situacaoChips: { key: Situacao; label: string }[] = [
    { key: 'OPEN', label: 'Em aberto' },
    { key: 'PAID', label: 'Pagas' },
    { key: 'ALL', label: 'Todas' },
];

// Cores dos cards / etiquetas por grupo (mesmo estilo das placas do Rota).
const GROUP_TONE: Record<string, string> = {
    FUNCIONARIOS: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300 dark:bg-fuchsia-500/20 dark:text-fuchsia-200 dark:border-fuchsia-500/40',
    REVENDA: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',
    MATERIA_PRIMA: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-200 dark:border-teal-500/40',
    ATIVO: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/40',
    DESPESAS_FIXAS: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40',
    SERVICOS: 'bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-500/20 dark:text-lime-200 dark:border-lime-500/40',
    IMPOSTOS: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/20 dark:text-orange-200 dark:border-orange-500/40',
    SOCIOS: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-500/20 dark:text-purple-200 dark:border-purple-500/40',
};
const TONE_OTHER = 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-500/40';
const TONE_NONE = 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-zinc-700/40 dark:text-zinc-200 dark:border-zinc-600';

function groupTone(group?: string | null) {
    return (group && GROUP_TONE[group]) || TONE_OTHER;
}

const GROUP_DESCRIPTION: Record<string, string> = {
    ALL: 'Visão de todas as contas — selecione e classifique cada uma na categoria certa.',
    FUNCIONARIOS: 'Freelancers e músicos.',
    REVENDA: 'Destilados, cervejas, refrigerantes e água.',
    MATERIA_PRIMA: 'Proteínas, estoque seco e hortifruti.',
    ATIVO: 'Copos, pratos, garfos, utensílios de cozinha e bar e equipamentos.',
    DESPESAS_FIXAS: 'Aluguel, água, luz, gás, telefone, internet e condomínio.',
    SERVICOS: 'Contabilidade, manutenção, limpeza, sistemas, marketing e segurança.',
    IMPOSTOS: 'Simples (DAS), guias, IPTU, taxas, alvarás e tarifas bancárias/cartão.',
    SOCIOS: 'Retiradas, pró-labore e empréstimos — controle, fora das contas urgentes.',
    OTHER: 'Categorias antigas que ainda não estão em nenhum grupo.',
    NONE: 'Contas que ainda não foram classificadas.',
};

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const labelClasse = 'text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1';

function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prazoLabel(bill: Bill) {
    const status = getDisplayStatus(bill);
    if (status === 'PAID') return { texto: 'Paga', tom: 'text-green-600 dark:text-green-400' };
    if (status === 'CANCELED') return { texto: 'Cancelada', tom: 'text-gray-400' };
    const d = Math.round((normalizeDate(bill.dueDate).getTime() - startOfToday().getTime()) / 86400000);
    if (d < 0) return { texto: `Vencida há ${-d} dia${d === -1 ? '' : 's'}`, tom: 'text-red-600 dark:text-red-400' };
    if (d === 0) return { texto: 'Vence hoje', tom: 'text-amber-600 dark:text-amber-400' };
    if (d === 1) return { texto: 'Vence amanhã', tom: 'text-amber-600 dark:text-amber-400' };
    return { texto: `Em ${d} dias`, tom: 'text-gray-500 dark:text-zinc-400' };
}

const statusTone: Record<string, string> = {
    OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    OVERDUE: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    PAID: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    CANCELED: 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-400',
};

// Filtro de grupo (chips do topo): todos, um dos grupos, categorias sem
// grupo ("Outras") ou contas ainda sem categoria.
type GroupFilter = 'ALL' | BillCategoryGroup | 'OTHER' | 'NONE';

const NO_CATEGORY = '__none__';

function isKnownGroup(group?: string | null) {
    return BILL_CATEGORY_GROUPS.some((g) => g.key === group);
}

// Mês escolhido fica salvo no navegador até a pessoa trocar de novo.
const MONTH_STORAGE_KEY = 'bills:month';

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number) {
    const [year, month] = (key || monthKey(new Date())).split('-').map(Number);
    return monthKey(new Date(year, month - 1 + delta, 1));
}

function monthLabel(key: string) {
    const [year, month] = key.split('-').map(Number);
    const text = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
    });
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function readStoredMonth(): string {
    if (typeof window === 'undefined') return '';
    try {
        const value = window.localStorage.getItem(MONTH_STORAGE_KEY);
        return value && /^\d{4}-\d{2}$/.test(value) ? value : '';
    } catch {
        return '';
    }
}

function storeMonth(value: string) {
    try {
        window.localStorage.setItem(MONTH_STORAGE_KEY, value || 'ALL');
    } catch {
        // navegador sem storage: só não lembra o mês
    }
}

function parseMoneyInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const number = Number(
        trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed,
    );
    return Number.isFinite(number) ? number : null;
}

function formatCurrency(value: string | number) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

// "era sáb., 15/11" — quando o vencimento foi empurrado pro dia útil.
function vencimentoOriginal(bill: { dueDateOriginal?: string | null }) {
    if (!bill.dueDateOriginal) return null;
    const d = new Date(bill.dueDateOriginal);
    const dia = d.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'short' }).replace('.', '');
    return `venc. original ${dia} ${d.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })} (fim de semana/feriado)`;
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
    // ?card=OVERDUE|TODAY|WEEK|MONTH — abre a lista já num dos cards de
    // período normais (mesmas regras de matchesPeriod). Usado pelos cards do
    // Dashboard Financeiro da loja Pessoa Física, que precisam bater
    // exatamente com o que esta tela mostra em cada card.
    const cardParam = searchParams.get('card');
    const initialCard: PeriodKey | null =
        cardParam === 'OVERDUE' ||
        cardParam === 'TODAY' ||
        cardParam === 'WEEK' ||
        cardParam === 'MONTH'
            ? cardParam
            : null;
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
    // Card de vencimento (Hoje/Semana/Mês/Vencidas). null = usa mês + situação.
    const [periodFilter, setPeriodFilter] = useState<PeriodKey | null>(initialCard);
    const [situacao, setSituacao] = useState<Situacao>('OPEN');
    const [month, setMonthState] = useState<string>(readStoredMonth);
    const [groupFilter, setGroupFilter] = useState<GroupFilter>('ALL');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [dueFrom, setDueFrom] = useState('');
    const [dueTo, setDueTo] = useState('');
    const [minValue, setMinValue] = useState('');
    const [maxValue, setMaxValue] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkCategory, setBulkCategory] = useState('');
    const [classifying, setClassifying] = useState(false);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const { categories } = useBillCategories({ seedDefaults: true });
    const [supplierFilter, setSupplierFilter] = useState('');
    const [paymentMethodFilter, setPaymentMethodFilter] =
        useState('');
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    // Cards de "gasto por categoria" começam escondidos (é muito card).
    const [mostrarCardsCategoria, setMostrarCardsCategoria] = useState(false);
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

    function setMonth(value: string) {
        setMonthState(value);
        storeMonth(value);
        setPeriodFilter(null);
    }

    function clearFilters() {
        setPeriodFilter(null);
        setSituacao('OPEN');
        setSearch('');
        setDueFrom('');
        setDueTo('');
        setMinValue('');
        setMaxValue('');
        setPaymentMethodFilter('');
        setSupplierFilter('');
    }

    function leaveDashboardFilter() {
        if (hasDashboardFilter) {
            router.replace('/bills');
        }
    }

    // Igual ao Rota: clicar num card limpa busca/datas/valores; clicar de
    // novo no card ativo desliga.
    function selectPeriod(period: PeriodKey) {
        leaveDashboardFilter();
        setSearch('');
        setDueFrom('');
        setDueTo('');
        setMinValue('');
        setMaxValue('');
        setPage(1);
        setPeriodFilter((current) => (current === period ? null : period));
    }

    function selectSituacao(value: Situacao) {
        leaveDashboardFilter();
        setPeriodFilter(null);
        setSituacao(value);
        setPage(1);
    }

    function changeDates(from: string, to: string) {
        setPeriodFilter(null);
        setDueFrom(from);
        setDueTo(to);
        setPage(1);
    }

    function selectGroup(value: GroupFilter) {
        setPeriodFilter(null);
        setSelectedIds(new Set());
        setGroupFilter(value);
        setCategoryFilter('');
        setPage(1);
    }

    function selectCategory(id: string) {
        setPeriodFilter(null);
        setPage(1);
        setCategoryFilter((current) => (current === id ? '' : id));
    }

    function matchesGroup(bill: Bill) {
        const category = bill.category;
        if (groupFilter === 'ALL') return true;
        if (groupFilter === 'NONE') return !category;
        if (groupFilter === 'OTHER') return !!category && !isKnownGroup(category.group);
        return category?.group === groupFilter;
    }

    function matchesCategory(bill: Bill) {
        if (categoryFilter) {
            return categoryFilter === NO_CATEGORY
                ? !bill.category
                : bill.category?.id === categoryFilter;
        }
        return matchesGroup(bill);
    }

    function matchesMonth(bill: Bill) {
        return !month || (bill.dueDate || '').slice(0, 7) === month;
    }

    // Filtros que não dependem do período/situação (busca, forma de
    // pagamento, vencimento de/até, valor mín/máx) — usados tanto na lista
    // final quanto nos cards.
    const searchedBills = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        const min = parseMoneyInput(minValue);
        const max = parseMoneyInput(maxValue);

        return bills.filter((bill) => {
            if (
                paymentMethodFilter &&
                bill.paymentMethod !== paymentMethodFilter
            ) {
                return false;
            }

            const due = (bill.dueDate || '').slice(0, 10);
            if (dueFrom && due < dueFrom) return false;
            if (dueTo && due > dueTo) return false;

            const value = Number(bill.value);
            if (min !== null && value < min) return false;
            if (max !== null && value > max) return false;

            if (normalizedSearch) {
                const searchableText = [
                    bill.description,
                    bill.store?.name,
                    bill.supplier?.name,
                    bill.purchase?.description,
                    bill.category?.name,
                    bill.category ? groupInfo(bill.category.group).label : 'sem categoria',
                    bill.barcode,
                    bill.pixKey,
                    bill.beneficiary,
                    bill.bankName,
                    formatCurrency(bill.value),
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
    }, [bills, search, paymentMethodFilter, dueFrom, dueTo, minValue, maxValue]);

    // Busca + grupo/categoria escolhidos.
    const scopedBills = useMemo(
        () => searchedBills.filter(matchesCategory),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [searchedBills, groupFilter, categoryFilter],
    );

    // Cards de vencimento: sempre olham pra hoje (não dependem do mês).
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

        for (const bill of scopedBills) {
            const value = Number(bill.value);

            for (const period of periods) {
                if (matchesPeriod(bill, period)) {
                    result[period].count += 1;
                    result[period].value += value;
                }
            }
        }

        return result;
    }, [scopedBills]);

    // "Gasto por categoria" do mês escolhido (ou de todos): total, pago e
    // em aberto de cada subcategoria. Respeita o grupo, não a categoria
    // clicada (pra dá pra trocar de card direto).
    const categoryStats = useMemo(() => {
        type Stats = { total: number; pago: number; aberto: number; count: number };
        const empty = (): Stats => ({ total: 0, pago: 0, aberto: 0, count: 0 });
        const byCategory = new Map<string, Stats>();
        const seen = new Map<string, BillCategory>();
        const all = empty();

        for (const bill of searchedBills) {
            if (!matchesMonth(bill) || !matchesGroup(bill)) continue;
            const status = getDisplayStatus(bill);
            if (status === 'CANCELED') continue;

            const value = Number(bill.value);
            const key = bill.category?.id ?? NO_CATEGORY;
            if (bill.category) seen.set(bill.category.id, bill.category);

            const stats = byCategory.get(key) ?? empty();
            for (const target of [stats, all]) {
                target.total += value;
                target.count += 1;
                if (status === 'PAID') target.pago += value;
                else target.aberto += value;
            }
            byCategory.set(key, stats);
        }

        // Cards: subcategorias dos grupos sempre aparecem (mesmo zeradas);
        // categoria antiga sem grupo só aparece se tiver conta.
        const universe = new Map<string, BillCategory>();
        for (const category of categories) universe.set(category.id, category);
        for (const [id, category] of seen) if (!universe.has(id)) universe.set(id, category);

        const cards = Array.from(universe.values())
            .filter((category) => {
                if (groupFilter === 'NONE') return false;
                if (groupFilter === 'OTHER') return !isKnownGroup(category.group) && byCategory.has(category.id);
                if (groupFilter !== 'ALL') return category.group === groupFilter;
                return isKnownGroup(category.group) || byCategory.has(category.id);
            })
            .sort((a, b) => {
                const ga = BILL_CATEGORY_GROUPS.findIndex((g) => g.key === a.group);
                const gb = BILL_CATEGORY_GROUPS.findIndex((g) => g.key === b.group);
                return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
            })
            .map((category) => ({ category, stats: byCategory.get(category.id) ?? empty() }));

        return {
            cards,
            all,
            none: byCategory.get(NO_CATEGORY) ?? null,
            hasOther: Array.from(universe.values()).some((c) => !isKnownGroup(c.group)),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchedBills, categories, month, groupFilter]);

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

        // Card de vencimento escolhido: ele manda (só contas em aberto,
        // independente do mês).
        if (periodFilter) {
            return scopedBills.filter((bill) => matchesPeriod(bill, periodFilter));
        }

        return scopedBills.filter((bill) => {
            const status = getDisplayStatus(bill);

            if (!matchesMonth(bill)) return false;
            if (status === 'CANCELED') return false;
            if (situacao === 'OPEN') return status === 'OPEN' || status === 'OVERDUE';
            if (situacao === 'PAID') return status === 'PAID';
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        searchedBills,
        scopedBills,
        situacao,
        periodFilter,
        month,
        dashboardPeriod,
        dashboardPaid,
        billIdFilter,
    ]);

    const filteredTotal = useMemo(
        () => filteredBills.reduce((sum, bill) => sum + Number(bill.value), 0),
        [filteredBills],
    );

    const totalPages = Math.max(1, Math.ceil(filteredBills.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    const pageBills = filteredBills.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const detailBill = detailId ? bills.find((bill) => bill.id === detailId) ?? null : null;

    // NF da conta (janela de atrelar / trocar / remover).
    const [nfBillId, setNfBillId] = useState<string | null>(null);
    const nfBill = nfBillId ? bills.find((bill) => bill.id === nfBillId) ?? null : null;
    const [vinculandoNfs, setVinculandoNfs] = useState(false);

    async function vincularNfsAutomatico() {
        try {
            setVinculandoNfs(true);
            const r = await api.post('/bills/nfs/vincular-automatico', { storeId: getActiveStore()?.id || undefined });
            toast.success(r.data?.vinculadas
                ? `${r.data.vinculadas} conta(s) atrelada(s) à NF.`
                : 'Nenhuma conta nova para atrelar automaticamente — use "Atrelar NF" na linha da conta.');
            await loadBills();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Não foi possível atrelar as NFs.');
        } finally {
            setVinculandoNfs(false);
        }
    }

    const allVisibleSelected =
        pageBills.length > 0 &&
        pageBills.every((bill) => selectedIds.has(bill.id));

    function toggleSelected(id: string) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAllVisible() {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (allVisibleSelected) {
                for (const bill of pageBills) next.delete(bill.id);
            } else {
                for (const bill of pageBills) next.add(bill.id);
            }
            return next;
        });
    }

    async function classifyBills(ids: string[], categoryId: string) {
        const response = await api.patch('/bills/classify', {
            ids,
            categoryId: categoryId || null,
        });
        const category = categories.find((c) => c.id === categoryId);
        setBills((current) =>
            current.map((bill) =>
                ids.includes(bill.id)
                    ? { ...bill, category: categoryId ? category ?? bill.category : null }
                    : bill,
            ),
        );
        return response.data?.total ?? ids.length;
    }

    // Marcar várias como pagas: no vencimento de cada uma, hoje, ou numa data.
    const [pagarModo, setPagarModo] = useState<'VENCIMENTO' | 'HOJE' | 'DATA'>('VENCIMENTO');
    const [pagarData, setPagarData] = useState('');
    const [pagandoVarias, setPagandoVarias] = useState(false);

    async function pagarSelecionadas() {
        const ids = Array.from(selectedIds);
        const abertas = bills.filter((b) => selectedIds.has(b.id) && (b.status === 'OPEN' || b.status === 'OVERDUE'));
        if (!abertas.length) {
            toast.error('Nenhuma das selecionadas está em aberto.');
            return;
        }
        if (pagarModo === 'DATA' && !pagarData) {
            toast.error('Escolha a data do pagamento.');
            return;
        }
        const total = abertas.reduce((s, b) => s + Number(b.value), 0);
        const quando = pagarModo === 'VENCIMENTO' ? 'cada uma na data do próprio vencimento' : pagarModo === 'HOJE' ? 'com data de hoje' : `com data de ${formatDate(`${pagarData}T12:00:00Z`)}`;
        if (!window.confirm(`Marcar ${abertas.length} conta(s) como paga(s) (${formatCurrency(total)}), ${quando}?`)) return;
        try {
            setPagandoVarias(true);
            const r = await api.patch('/bills/pay-many', {
                ids,
                paidAt: pagarModo === 'VENCIMENTO' ? 'VENCIMENTO' : pagarModo === 'DATA' ? pagarData : undefined,
            });
            toast.success(`${r.data.pagas} conta(s) marcada(s) como paga(s).${r.data.erros ? ` ${r.data.erros} com erro.` : ''}`);
            setSelectedIds(new Set());
            await loadBills();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao marcar as contas como pagas.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setPagandoVarias(false);
        }
    }

    function selecionarTodasDaLista() {
        setSelectedIds(new Set(filteredBills.map((b) => b.id)));
    }

    async function classifySelected() {
        if (selectedIds.size === 0) return;
        try {
            setClassifying(true);
            const total = await classifyBills(Array.from(selectedIds), bulkCategory);
            const name = categories.find((c) => c.id === bulkCategory)?.name;
            toast.success(
                bulkCategory
                    ? `${total} conta(s) classificada(s) como ${name}.`
                    : `Categoria removida de ${total} conta(s).`,
            );
            setSelectedIds(new Set());
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao classificar as contas.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setClassifying(false);
        }
    }

    async function classifyOne(bill: Bill, categoryId: string) {
        try {
            setProcessingId(bill.id);
            await classifyBills([bill.id], categoryId);
            toast.success(categoryId ? 'Categoria atualizada.' : 'Categoria removida.');
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao classificar a conta.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setProcessingId(null);
        }
    }

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

    // Imprime exatamente o que está na lista agora (Hoje, Semana, Vencidas,
    // Pagas, categoria, busca...), todas as páginas.
    function imprimirTela() {
        const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
        const periodoNome: Record<string, string> = { TODAY: 'A pagar hoje', WEEK: 'Desta semana', MONTH: 'Deste mês', OVERDUE: 'Vencidas', ALL: 'Em aberto' };
        const situacaoNome: Record<string, string> = { OPEN: 'Em aberto', PAID: 'Pagas', ALL: 'Todas' };
        const partes: string[] = [];
        if (billIdFilter) partes.push('Conta selecionada');
        else if (dashboardPeriod) partes.push(`Dashboard: ${dashboardPaid ? dashboardPaidLabel[dashboardPaid] : ''} ${dashboardPeriodLabel[dashboardPeriod]}`);
        else if (periodFilter) partes.push(periodoNome[periodFilter] ?? '');
        else {
            partes.push(situacaoNome[situacao] ?? '');
            partes.push(month ? monthLabel(month) : 'todos os meses');
        }
        if (categoryFilter) partes.push(categoryFilter === NO_CATEGORY ? 'Sem categoria' : categories.find((c) => c.id === categoryFilter)?.name ?? '');
        else if (groupFilter !== 'ALL') partes.push(groupFilter === 'NONE' ? 'Sem categoria' : groupFilter === 'OTHER' ? 'Outras' : groupInfo(groupFilter).label);
        if (search.trim()) partes.push(`busca "${search.trim()}"`);
        if (dueFrom || dueTo) partes.push(`vencimento ${dueFrom ? formatDate(dueFrom) : '...'} a ${dueTo ? formatDate(dueTo) : '...'}`);
        if (minValue || maxValue) partes.push(`valor ${minValue || '0'} a ${maxValue || '...'}`);
        if (paymentMethodFilter) partes.push(paymentMethodLabel[paymentMethodFilter] ?? paymentMethodFilter);
        const filtro = partes.filter(Boolean).join(' · ');

        const linhas = filteredBills.map((bill) => {
            const status = getDisplayStatus(bill);
            return `<tr>
                <td>${esc(formatDate(bill.dueDate))}</td>
                <td>${esc(bill.description)}${bill.queuedForPaymentAt && status === 'OVERDUE' ? ' <small>(nos pagamentos de hoje)</small>' : ''}</td>
                <td>${esc(bill.supplier?.name ?? '-')}</td>
                <td>${esc(bill.category?.name ?? '-')}</td>
                <td>${esc(paymentMethodLabel[bill.paymentMethod] ?? bill.paymentMethod)}${bill.barcode ? `<br><small class="mono">${esc(bill.barcode)}</small>` : ''}${bill.pixKey ? `<br><small>PIX: ${esc(bill.pixKey)}</small>` : ''}</td>
                <td>${esc(billStatusLabel[status] ?? status)}</td>
                <td class="v">${esc(formatCurrency(bill.value))}</td>
            </tr>`;
        }).join('');

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Contas a Pagar — ${esc(filtro)}</title>
            <style>
                body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
                h1{font-size:18px;margin:0 0 4px} p{margin:0 0 12px;color:#555}
                table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left;vertical-align:top}
                th{background:#f3f4f6;font-size:11px;text-transform:uppercase} .v{text-align:right;white-space:nowrap}
                tfoot td{font-weight:bold;border-top:2px solid #111} small{color:#666} .mono{font-family:monospace}
                @media print{body{margin:10mm}}
            </style></head><body>
            <h1>Contas a Pagar — ${esc(filtro)}</h1>
            <p>${esc(getActiveStore()?.name ?? '')} · ${filteredBills.length} conta(s) · impresso em ${esc(new Date().toLocaleString('pt-BR'))}</p>
            <table><thead><tr><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Categoria</th><th>Forma</th><th>Status</th><th class="v">Valor</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="7">Nenhuma conta.</td></tr>'}</tbody>
            <tfoot><tr><td colspan="6">Total</td><td class="v">${esc(formatCurrency(filteredTotal))}</td></tr></tfoot></table>
            <script>window.onload=function(){window.print();}</script>
            </body></html>`;

        const janela = window.open('', '_blank');
        if (!janela) {
            toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.');
            return;
        }
        janela.document.open();
        janela.document.write(html);
        janela.document.close();
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

    const groupButtons: { value: GroupFilter; label: string }[] = [
        { value: 'ALL', label: 'Todas (classificar)' },
        ...BILL_CATEGORY_GROUPS.map((g) => ({ value: g.key as GroupFilter, label: g.label })),
        ...(categoryStats.hasOther ? [{ value: 'OTHER' as GroupFilter, label: OTHER_GROUP.label }] : []),
        { value: 'NONE', label: 'Sem categoria' },
    ];

    const btnBranco =
        'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-50';

    const hasFilters =
        Boolean(periodFilter || search || dueFrom || dueTo || minValue || maxValue || paymentMethodFilter || supplierFilter) ||
        situacao !== 'OPEN';

    return (
        <AppLayout title="Contas a Pagar">
            <div className="space-y-6">
                <AbasContas ativa="pagar" />
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Contas a Pagar</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        {GROUP_DESCRIPTION[groupFilter] ?? ''} Clique em um card para filtrar e em uma conta para ver os detalhes.
                    </p>
                </div>

                {hasDashboardFilter && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3">
                        <p className="text-sm text-cyan-700 dark:text-cyan-400">
                            {billIdFilter
                                ? 'Mostrando a conta selecionada no Dashboard Financeiro.'
                                : `Filtro do Dashboard Financeiro: contas ${dashboardPaid ? dashboardPaidLabel[dashboardPaid] : ''} com vencimento ${dashboardPeriod ? dashboardPeriodLabel[dashboardPeriod] : ''}.`}
                        </p>
                        <button type="button" onClick={clearDashboardFilter} className="inline-flex items-center gap-1 text-sm text-cyan-700 dark:text-cyan-400">
                            <X size={14} /> Limpar filtro
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap gap-2">
                    {groupButtons.map((g) => (
                        <button
                            key={g.value}
                            type="button"
                            onClick={() => selectGroup(g.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${groupFilter === g.value
                                ? 'bg-blue-600 text-white'
                                : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
                                }`}
                        >
                            {g.label}
                        </button>
                    ))}
                    <button type="button" onClick={imprimirTela} className={`ml-auto ${btnBranco}`} title="Imprime as contas que estão na lista agora (escolha 'Salvar como PDF' no destino)">
                        <Printer size={15} /> Imprimir ({filteredBills.length})
                    </button>
                    <button type="button" onClick={downloadTodayReport} disabled={downloadingReport} className={btnBranco} title="Relatório do dia em PDF (gerado pelo servidor)">
                        <Download size={15} /> {downloadingReport ? 'Gerando...' : 'Relatório do dia'}
                    </button>
                    {podeGerenciarLote && (
                        <>
                            <button type="button" onClick={generateBatchPayment} disabled={generatingBatch} className={btnBranco}>
                                <Banknote size={15} /> {generatingBatch ? 'Gerando...' : 'Lançamento em lote'}
                            </button>
                            <button type="button" onClick={() => setShowBatchConfig(true)} className={btnBranco} title="Configurar convênio Sicredi">
                                <Settings size={15} />
                            </button>
                        </>
                    )}
                </div>

                {/* Filtro por mês (igual ao Rota) */}
                <div className={`flex flex-wrap items-center gap-3 p-3 rounded-2xl border ${month ? 'border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10' : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}>
                    <div className="flex items-center gap-2">
                        <CalendarDays size={18} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {month ? monthLabel(month) : 'Todos os meses'}
                        </span>
                    </div>
                    <div className="inline-flex items-center gap-1">
                        <button type="button" title="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                            <ChevronLeft size={16} />
                        </button>
                        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                            className="px-2 py-1 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white" />
                        <button type="button" title="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                            <ChevronRight size={16} />
                        </button>
                        <button type="button" onClick={() => setMonth(monthKey(new Date()))}
                            className="ml-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800">
                            Este mês
                        </button>
                        <button type="button" onClick={() => setMonth('')}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium ${!month ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
                            Todos
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {([
                        { key: 'TODAY', titulo: 'Hoje', tom: 'text-amber-600 dark:text-amber-400', borda: 'border-amber-400' },
                        { key: 'WEEK', titulo: 'Esta semana', tom: 'text-blue-600 dark:text-blue-400', borda: 'border-blue-500' },
                        { key: 'MONTH', titulo: 'Este mês', tom: 'text-gray-900 dark:text-white', borda: 'border-gray-500' },
                        { key: 'OVERDUE', titulo: 'Vencidas', tom: 'text-red-600 dark:text-red-400', borda: 'border-red-500' },
                    ] as const).map((b) => {
                        const bloco = periodTotals[b.key];
                        const ativo = periodFilter === b.key && !hasDashboardFilter;
                        return (
                            <div key={b.key}
                                className={`p-4 rounded-xl bg-white dark:bg-zinc-900 border text-left transition ${ativo ? `${b.borda} ring-2 ring-blue-500/20` : 'border-gray-200 dark:border-zinc-800'}`}>
                                <button type="button" onClick={() => selectPeriod(b.key)} className="w-full text-left">
                                    <p className="text-xs text-gray-400">{b.titulo}</p>
                                    <p className={`text-lg font-bold ${b.tom}`}>{formatCurrency(bloco.value)}</p>
                                    <p className="text-xs text-gray-400">{bloco.count} conta{bloco.count === 1 ? '' : 's'}</p>
                                </button>
                                {b.key === 'OVERDUE' && bloco.count > 0 && (
                                    <button type="button" onClick={queueAllOverdueToday} disabled={queuingAllOverdue}
                                        className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition">
                                        <Clock size={13} />
                                        {queuingAllOverdue ? 'Enviando...' : 'Mandar todas pra hoje'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setMostrarCardsCategoria((v) => !v)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800">
                            {mostrarCardsCategoria ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {mostrarCardsCategoria ? 'Ocultar cards' : 'Visualizar cards'} — gasto por categoria ({month ? monthLabel(month) : 'todos os meses'})
                        </button>
                        {categoryFilter && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                                Filtrando: {categoryFilter === NO_CATEGORY ? 'Sem categoria' : categories.find((c) => c.id === categoryFilter)?.name}
                                <button type="button" onClick={() => setCategoryFilter('')} aria-label="Tirar filtro"><X size={12} /></button>
                            </span>
                        )}
                        {mostrarCardsCategoria && <span className="text-xs text-gray-400">(clique para filtrar, clique de novo para limpar)</span>}
                    </div>
                    {mostrarCardsCategoria && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {categoryStats.cards.map(({ category, stats }) => {
                            const ativo = categoryFilter === category.id;
                            return (
                                <button key={category.id} type="button" onClick={() => selectCategory(category.id)}
                                    className={`p-3 rounded-xl border text-left transition ${groupTone(category.group)} ${ativo ? 'ring-2 ring-blue-500' : ''}`}>
                                    <p className="truncate text-xs font-bold">{category.name}</p>
                                    <p className="text-sm font-bold">{formatCurrency(stats.total)}</p>
                                    <p className="text-[10px] opacity-80">pago {formatCurrency(stats.pago)} · aberto {formatCurrency(stats.aberto)}</p>
                                </button>
                            );
                        })}
                        <button type="button" onClick={() => selectCategory(NO_CATEGORY)}
                            className={`p-3 rounded-xl border text-left ${TONE_NONE} ${categoryFilter === NO_CATEGORY ? 'ring-2 ring-blue-500' : ''}`}>
                            <p className="text-xs font-bold">Sem categoria</p>
                            <p className="text-sm font-bold">{formatCurrency(categoryStats.none?.total ?? 0)}</p>
                            <p className="text-[10px] opacity-80">pago {formatCurrency(categoryStats.none?.pago ?? 0)} · aberto {formatCurrency(categoryStats.none?.aberto ?? 0)}</p>
                        </button>
                    </div>
                    )}
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 space-y-3">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        <div className="lg:col-span-2">
                            <label className={labelClasse}>Buscar (nome, fornecedor, categoria)</label>
                            <input value={search} onChange={(e) => { setPeriodFilter(null); setSearch(e.target.value); setPage(1); }}
                                className={campoClasse} placeholder="Ex: ambev, cerveja, hortifruti..." />
                        </div>
                        <div>
                            <label className={labelClasse}>Vencimento de</label>
                            <input type="date" value={dueFrom} onChange={(e) => changeDates(e.target.value, dueTo)} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>até</label>
                            <input type="date" value={dueTo} onChange={(e) => changeDates(dueFrom, e.target.value)} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Valor mín. (R$)</label>
                            <MoneyInput value={minValue} onChange={(e) => { setPeriodFilter(null); setMinValue(e.target.value); setPage(1); }} className={campoClasse} />
                        </div>
                        <div>
                            <label className={labelClasse}>Valor máx. (R$)</label>
                            <MoneyInput value={maxValue} onChange={(e) => { setPeriodFilter(null); setMaxValue(e.target.value); setPage(1); }} className={campoClasse} />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {situacaoChips.map((chip) => (
                            <button key={chip.key} type="button" onClick={() => selectSituacao(chip.key)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition ${!periodFilter && situacao === chip.key
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
                                {chip.label}
                            </button>
                        ))}
                        <button type="button" onClick={() => { const h = todayISO(); changeDates(h, h); }}
                            className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
                            Só o dia de hoje
                        </button>
                        <button type="button" onClick={() => setShowMoreFilters((v) => !v)}
                            className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition">
                            Mais filtros
                        </button>
                        {hasFilters && (
                            <button type="button" onClick={clearFilters} className="px-3 py-1 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                Limpar filtros
                            </button>
                        )}
                        {periodFilter && (
                            <span className="text-xs text-gray-500 dark:text-zinc-400">
                                Mostrando: {{ TODAY: 'a pagar hoje', WEEK: 'desta semana', MONTH: 'deste mês', OVERDUE: 'vencidas', ALL: 'em aberto' }[periodFilter]}
                            </span>
                        )}
                    </div>

                    {showMoreFilters && (
                        <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClasse}>Forma de pagamento</label>
                                <select value={paymentMethodFilter} onChange={(e) => setPaymentMethodFilter(e.target.value)} className={campoClasse}>
                                    <option value="">Todas as formas</option>
                                    {Object.entries(paymentMethodLabel).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClasse}>Fornecedor</label>
                                <div className="px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950">
                                    <AutocompleteInput
                                        options={suppliers.map((supplier) => ({ id: supplier.id, nome: supplier.name }))}
                                        value={supplierFilter}
                                        onChange={setSupplierFilter}
                                        placeholder="Todos os fornecedores"
                                        className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-white"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {podeGerenciarLote && (
                        <button onClick={() => router.push('/bills/omie')}
                            title="Buscar todas as contas a pagar do Omie (por bar)"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                            <CloudDownload size={16} /> Buscar do Omie
                        </button>
                    )}
                    <button onClick={vincularNfsAutomatico} disabled={vinculandoNfs}
                        title="Liga as contas às NFs de entrada do sistema pela chave da NF-e ou pelo CNPJ + número da nota"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition disabled:opacity-50">
                        <Link2 size={16} /> {vinculandoNfs ? 'Atrelando NFs…' : 'Atrelar NFs automaticamente'}
                    </button>
                    <button onClick={() => router.push('/bills/reconcile')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                        <Landmark size={16} /> Conciliar com banco
                    </button>
                    <button onClick={() => router.push('/bills/new')}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
                        <Plus size={16} /> Nova Conta
                    </button>
                </div>

                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
                    {loading ? (
                        <p className="text-sm text-gray-400 py-8 text-center">Carregando...</p>
                    ) : filteredBills.length === 0 ? (
                        <p className="text-sm text-gray-400 py-8 text-center">Nenhuma conta encontrada com esses filtros.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            {selectedIds.size > 0 && (
                                <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/30">
                                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                        {selectedIds.size} selecionada{selectedIds.size > 1 ? 's' : ''} — classificar como:
                                    </span>
                                    <BillCategorySelect
                                        categories={categories}
                                        value={bulkCategory}
                                        onChange={setBulkCategory}
                                        placeholder="Sem categoria"
                                        className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white"
                                    />
                                    <button disabled={classifying} onClick={classifySelected}
                                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white disabled:opacity-50">
                                        {classifying ? 'Aplicando...' : 'Aplicar'}
                                    </button>
                                    <span className="mx-1 text-gray-300">|</span>
                                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">marcar como pagas:</span>
                                    <select value={pagarModo} onChange={(e) => setPagarModo(e.target.value as 'VENCIMENTO' | 'HOJE' | 'DATA')}
                                        className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white">
                                        <option value="VENCIMENTO">pagas no vencimento de cada uma</option>
                                        <option value="HOJE">pagas hoje</option>
                                        <option value="DATA">pagas na data…</option>
                                    </select>
                                    {pagarModo === 'DATA' && (
                                        <input type="date" value={pagarData} onChange={(e) => setPagarData(e.target.value)}
                                            className="px-2 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white" />
                                    )}
                                    <button disabled={pagandoVarias} onClick={pagarSelecionadas}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white disabled:opacity-50">
                                        <CheckCircle2 size={14} /> {pagandoVarias ? 'Registrando...' : 'Registrar pagamento'}
                                    </button>
                                    <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-zinc-300">
                                        Limpar
                                    </button>
                                    {allVisibleSelected && selectedIds.size < filteredBills.length && (
                                        <button onClick={selecionarTodasDaLista} className="w-full text-left text-xs text-blue-700 dark:text-blue-300 hover:underline">
                                            Selecionar todas as {filteredBills.length} contas da lista (todas as páginas)
                                        </button>
                                    )}
                                </div>
                            )}
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs text-gray-400 dark:text-zinc-500 border-b border-gray-100 dark:border-zinc-800">
                                        <th className="py-2.5 pl-4 pr-1 w-8">
                                            <input type="checkbox" title="Selecionar todas desta página" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
                                        </th>
                                        <th className="py-2.5 px-4 font-medium">Descrição</th>
                                        <th className="py-2.5 px-4 font-medium">Fornecedor</th>
                                        <th className="py-2.5 px-4 font-medium">Categoria</th>
                                        <th className="py-2.5 px-4 font-medium">Vencimento</th>
                                        <th className="py-2.5 px-4 font-medium">Valor</th>
                                        <th className="py-2.5 px-4 font-medium">Status</th>
                                        <th className="py-2.5 px-4 font-medium"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pageBills.map((bill) => {
                                        const status = getDisplayStatus(bill);
                                        const prazo = prazoLabel(bill);
                                        const aberta = status === 'OPEN' || status === 'OVERDUE';
                                        return (
                                            <tr key={bill.id} onClick={() => setDetailId(bill.id)}
                                                className="border-b border-gray-50 dark:border-zinc-800/60 text-gray-700 dark:text-zinc-300 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                                                <td className="py-2.5 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedIds.has(bill.id)} onChange={() => toggleSelected(bill.id)} />
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <p className="font-semibold text-gray-900 dark:text-white">
                                                        <span className={`inline-block mr-2 px-2 py-0.5 rounded border text-[10px] font-bold uppercase align-middle ${bill.category ? groupTone(bill.category.group) : TONE_NONE}`}>
                                                            {bill.category ? groupInfo(bill.category.group).label : 'Sem categoria'}
                                                        </span>
                                                        {bill.description}
                                                    </p>
                                                    <NfChip bill={bill} onAbrir={() => setNfBillId(bill.id)} onRemovido={loadBills} />
                                                    {bill.queuedForPaymentAt && status === 'OVERDUE' && (
                                                        <span className="inline-block mt-0.5 text-xs text-amber-600 dark:text-amber-400">Nos pagamentos de hoje</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4">{bill.supplier?.name ?? '-'}</td>
                                                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <BillCategorySelect
                                                        categories={categories}
                                                        value={bill.category?.id || ''}
                                                        disabled={processingId === bill.id}
                                                        onChange={(categoryId) => classifyOne(bill, categoryId)}
                                                        placeholder="-"
                                                        className="max-w-[11rem] bg-transparent text-sm text-gray-700 dark:text-zinc-300 rounded px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer outline-none"
                                                    />
                                                </td>
                                                <td className="py-2.5 px-4 whitespace-nowrap">
                                                    <p>{formatDate(bill.dueDate)}</p>
                                                    <p className={`text-xs ${prazo.tom}`}>{prazo.texto}</p>
                                                    {bill.dueDateOriginal && (
                                                        <p className="text-[11px] text-gray-400" title={vencimentoOriginal(bill) ?? ''}>era {formatDate(bill.dueDateOriginal).slice(0, 5)} · dia não útil</p>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 whitespace-nowrap">
                                                    <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(bill.value)}</p>
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusTone[status] ?? statusTone.OPEN}`}>
                                                        {billStatusLabel[status] ?? status}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-2">
                                                        {status === 'OVERDUE' && (
                                                            <button onClick={() => toggleQueueToday(bill)} disabled={processingId === bill.id}
                                                                title={bill.queuedForPaymentAt ? 'Remover de hoje' : 'Incluir em hoje'}
                                                                className={`p-1.5 rounded-lg transition ${bill.queuedForPaymentAt ? 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800'}`}>
                                                                <Clock size={16} />
                                                            </button>
                                                        )}
                                                        {aberta && (
                                                            <button onClick={() => markAsPaid(bill)} disabled={processingId === bill.id} title="Marcar como paga"
                                                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 transition">
                                                                <CheckCircle2 size={16} />
                                                            </button>
                                                        )}
                                                        <button onClick={() => setDetailId(bill.id)} title="Detalhes / editar"
                                                            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                                                            <Pencil size={16} />
                                                        </button>
                                                        {status !== 'CANCELED' && status !== 'PAID' && (
                                                            <button onClick={() => cancelBill(bill)} disabled={processingId === bill.id} title="Cancelar conta"
                                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-zinc-800 text-sm text-gray-500 dark:text-zinc-400">
                                <span>
                                    {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredBills.length)} de {filteredBills.length} · total {formatCurrency(filteredTotal)}
                                </span>
                                <div className="flex items-center gap-2">
                                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                                        className="px-2 py-1 rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm">
                                        {[20, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
                                    </select>
                                    <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}
                                        className="p-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 disabled:opacity-40"><ChevronLeft size={16} /></button>
                                    <span>{currentPage} / {totalPages}</span>
                                    <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}
                                        className="p-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 disabled:opacity-40"><ChevronRight size={16} /></button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {detailBill && (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setDetailId(null)}>
                    <div className="my-8 w-full max-w-4xl rounded-2xl bg-white dark:bg-zinc-900 p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 flex items-center justify-between">
                            <p className="font-semibold text-gray-900 dark:text-white">Detalhes da conta</p>
                            <button type="button" onClick={() => setDetailId(null)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-zinc-300">
                            <span className="font-medium">Nota fiscal:</span>
                            <NfChip bill={detailBill} onAbrir={() => setNfBillId(detailBill.id)} onRemovido={loadBills} />
                        </div>
                        <BillRow
                            bill={detailBill}
                            processing={processingId === detailBill.id}
                            expanded
                            onToggleExpanded={() => setDetailId(null)}
                            selected={false}
                            onToggleSelected={() => undefined}
                            hideSelect
                            categories={categories}
                            onClassify={classifyOne}
                            onCopy={copyText}
                            onPay={markAsPaid}
                            onCancel={cancelBill}
                            onToggleQueueToday={toggleQueueToday}
                            onOpenPurchase={(purchaseId) => router.push(`/purchases/${purchaseId}`)}
                            onSaved={loadBills}
                        />
                    </div>
                </div>
            )}

            {nfBill && (
                <NfVinculoModal bill={nfBill} onClose={() => setNfBillId(null)} onChanged={loadBills} />
            )}

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
    selected,
    onToggleSelected,
    categories,
    onClassify,
    hideSelect,
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
    selected: boolean;
    onToggleSelected: () => void;
    categories: BillCategory[];
    onClassify: (bill: Bill, categoryId: string) => Promise<void>;
    hideSelect?: boolean;

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
    const [editingBill, setEditingBill] = useState(false);

    return (
        <article
            className={`overflow-hidden rounded-2xl border ${displayStatus === 'OVERDUE'
                ? 'border-red-500/30 bg-red-500/[0.04]'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                }`}
        >
            <div className="flex items-stretch">
            <label
                className={`${hideSelect ? 'hidden' : 'flex'} shrink-0 cursor-pointer items-start pl-4 pt-5 sm:items-center sm:pt-0`}
                onClick={(event) => event.stopPropagation()}
            >
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelected}
                    className="h-4 w-4 accent-blue-600"
                    aria-label="Selecionar conta"
                />
            </label>
            <button
                type="button"
                onClick={onToggleExpanded}
                className="flex w-full min-w-0 flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:gap-4"
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

                <div className="shrink-0 sm:w-40">
                    {bill.category ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-zinc-300 px-2.5 py-1 text-xs dark:border-zinc-700">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${groupInfo(bill.category.group).dot}`} />
                            <span className="truncate">{bill.category.name}</span>
                        </span>
                    ) : (
                        <span className="inline-flex rounded-full border border-dashed border-red-400/60 px-2.5 py-1 text-xs text-red-500">
                            Sem categoria
                        </span>
                    )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-28">
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

                <div className="shrink-0 text-left sm:w-28 sm:text-right">
                    <p className="text-xs text-zinc-500 sm:hidden">
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
            </div>

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
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                            <Tag size={14} />
                            Categoria
                        </span>
                        <div className="w-full sm:w-72">
                            <BillCategorySelect
                                categories={categories}
                                value={bill.category?.id || ''}
                                disabled={processing}
                                onChange={(categoryId) => onClassify(bill, categoryId)}
                                className="h-9 w-full rounded-lg border border-zinc-300 bg-white px-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                            {paymentMethodLabel[
                                bill.paymentMethod
                            ] ||
                                billTypeLabel[bill.type] ||
                                bill.paymentMethod}
                        </span>

                        {displayStatus !== 'CANCELED' && !editingBill && (
                            <button
                                type="button"
                                onClick={() => setEditingBill(true)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/20"
                            >
                                <Pencil size={12} />
                                Editar conta
                            </button>
                        )}

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
                            secondary={[getDueDateMessage(bill), vencimentoOriginal(bill)].filter(Boolean).join(' · ')}
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

                    {editingBill && (
                        <BillEditForm
                            bill={bill}
                            onCancel={() => setEditingBill(false)}
                            onSaved={async () => {
                                setEditingBill(false);
                                await onSaved();
                            }}
                        />
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
                                href={arquivoUrl(bill.fileUrl)}
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
                                href={arquivoUrl(bill.paymentProofUrl)}
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

// Edição completa da conta (descrição, valor, vencimento, forma de
// pagamento, observações). Quando a conta veio de uma recorrência, dá pra
// aplicar a mudança em TODAS as contas ainda em aberto da série de uma vez
// (ex.: valor digitado errado) — contas já pagas nunca são alteradas.
function BillEditForm({
    bill,
    onCancel,
    onSaved,
}: {
    bill: Bill;
    onCancel: () => void;
    onSaved: () => Promise<void>;
}) {
    const [description, setDescription] = useState(bill.description);
    const [value, setValue] = useState(
        String(Number(bill.value)).replace('.', ','),
    );
    const [dueDate, setDueDate] = useState(
        (bill.dueDate || '').slice(0, 10),
    );
    const [paymentMethod, setPaymentMethod] = useState(bill.paymentMethod);
    const [notes, setNotes] = useState(bill.notes || '');
    const [applyAll, setApplyAll] = useState(false);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        const numericValue = Number(
            value.replace(/\./g, '').replace(',', '.'),
        );

        if (!description.trim() || !Number.isFinite(numericValue) || numericValue < 0) {
            toast.error('Informe descrição e um valor válido.');
            return;
        }

        try {
            setSaving(true);

            if (applyAll && bill.recorrenciaId) {
                const originalDay = Number((bill.dueDate || '').slice(8, 10));
                const newDay = Number(dueDate.slice(8, 10));

                const { data } = await api.patch(
                    `/bills/recorrencias/${bill.recorrenciaId}/apply-all`,
                    {
                        description: description.trim(),
                        value: numericValue,
                        paymentMethod,
                        notes,
                        dayOfMonth:
                            newDay && newDay !== originalDay && newDay <= 30
                                ? newDay
                                : undefined,
                    },
                );

                toast.success(
                    `${data?.atualizadas ?? 0} conta(s) em aberto atualizada(s).`,
                );
            } else {
                await api.put(`/bills/${bill.id}`, {
                    description: description.trim(),
                    value: numericValue,
                    dueDate,
                    paymentMethod,
                    notes,
                });

                toast.success('Conta atualizada.');
            }

            await onSaved();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar conta.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSaving(false);
        }
    }

    const inputClass =
        'mt-1 h-10 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500';

    return (
        <div className="mt-4 rounded-2xl border border-blue-500/30 bg-white dark:bg-zinc-900 p-4">
            <p className="mb-3 text-sm font-semibold">Editar conta</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs text-zinc-500 sm:col-span-2">
                    Descrição
                    <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={inputClass}
                    />
                </label>

                <label className="text-xs text-zinc-500">
                    Valor (R$)
                    <MoneyInput formato="virgula"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className={inputClass}
                    />
                </label>

                <label className="text-xs text-zinc-500">
                    Vencimento
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={inputClass}
                    />
                </label>

                <label className="text-xs text-zinc-500">
                    Forma de pagamento
                    <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className={inputClass}
                    >
                        {Object.entries(paymentMethodLabel).map(
                            ([val, label]) => (
                                <option key={val} value={val}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>

                <label className="text-xs text-zinc-500 sm:col-span-2">
                    Observações
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    />
                </label>
            </div>

            {bill.recorrenciaId && (
                <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <input
                        type="checkbox"
                        checked={applyAll}
                        onChange={(e) => setApplyAll(e.target.checked)}
                        className="mt-0.5"
                    />
                    <span>
                        Aplicar em <strong>todas as contas em aberto</strong>{' '}
                        desta recorrência (as já pagas não são alteradas). Se
                        mudar o dia do vencimento, o novo dia vale para todos
                        os meses.
                    </span>
                </label>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Salvando...' : 'Salvar'}
                </button>

                <button
                    type="button"
                    disabled={saving}
                    onClick={onCancel}
                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                    Cancelar
                </button>
            </div>
        </div>
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
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 dark:border-yellow-500/20 dark:bg-yellow-500/10 p-4">
                <p className="text-xs font-medium text-amber-800 dark:text-yellow-300">
                    Código de barras / linha digitável
                </p>

                {bill.barcode ? (
                    <>
                        <p className="mt-2 break-all font-mono text-sm font-semibold text-gray-900 dark:text-yellow-100">
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
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-400 bg-white dark:bg-transparent dark:border-yellow-500/30 px-3 py-2 text-sm font-medium text-amber-800 dark:text-yellow-400 hover:bg-amber-100 dark:hover:bg-yellow-500/10"
                        >
                            <ClipboardCopy size={16} />
                            Copiar código
                        </button>
                    </>
                ) : (
                    <p className="mt-1 text-sm text-amber-700 dark:text-yellow-400/70">
                        Código não cadastrado. Consulte o arquivo
                        anexado.
                    </p>
                )}
            </div>
        );
    }

    if (bill.paymentMethod === 'PIX') {
        return (
            <div className="mt-4 rounded-2xl border border-purple-300 bg-purple-50 dark:border-purple-500/20 dark:bg-purple-500/10 p-4">
                <p className="text-sm font-semibold text-purple-800 dark:text-purple-300">
                    Dados para pagamento via PIX
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {bill.pixKey && (
                        <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-white dark:bg-zinc-950/50 p-3">
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
                                className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
                            >
                                <ClipboardCopy size={15} />
                                Copiar chave
                            </button>
                        </div>
                    )}

                    {bill.beneficiary && (
                        <div className="rounded-xl border border-purple-200 dark:border-purple-500/20 bg-white dark:bg-zinc-950/50 p-3">
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
                    <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-500/20 bg-white dark:bg-zinc-950/50 p-3">
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
                            className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-purple-700 hover:text-purple-900 dark:text-purple-400 dark:hover:text-purple-300"
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

