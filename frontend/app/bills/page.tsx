'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    Building2,
    Calendar,
    CalendarDays,
    Check,
    CheckCircle2,
    ClipboardCopy,
    Clock,
    CreditCard,
    ExternalLink,
    FileText,
    Landmark,
    Plus,
    ReceiptText,
    Search,
    SlidersHorizontal,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

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

    status: string;

    externalLaunchStatus: string;
    externalSystemName?: string | null;
    externalCode?: string | null;

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
    PAID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
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
        activeClass: 'border-emerald-500 bg-emerald-500/10 text-emerald-500',
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

// Os cards de período são a forma principal de enxergar o que está em
// aberto — "hoje", "esta semana" e "este mês" são janelas que começam
// hoje (não incluem o que já venceu, que tem card próprio).
function matchesPeriod(bill: Bill, period: PeriodKey): boolean {
    const displayStatus = getDisplayStatus(bill);

    if (period === 'OVERDUE') {
        return displayStatus === 'OVERDUE';
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
    const router = useRouter();

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
                    bill.externalCode,
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
        return searchedBills.filter((bill) => {
            if (statusFilter) {
                return getDisplayStatus(bill) === statusFilter;
            }

            return matchesPeriod(bill, periodFilter);
        });
    }, [searchedBills, statusFilter, periodFilter]);

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

    async function markAsLaunched(bill: Bill) {
        const externalCode =
            window.prompt(
                'Informe o código do lançamento no OMIE, se existir:',
                bill.externalCode || '',
            ) || undefined;

        try {
            setProcessingId(bill.id);

            await api.patch(`/bills/${bill.id}/launch`, {
                externalSystemName: 'OMIE',
                externalCode,
            });

            toast.success(
                'Conta marcada como lançada no OMIE.',
            );

            await loadBills();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao atualizar lançamento.',
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


    return (
        <AppLayout title="Contas a Pagar">
            <div className="space-y-6">
                <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">
                            Contas a Pagar
                        </h2>

                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Controle vencimentos, PIX, boletos,
                            cartões e lançamentos no OMIE.
                        </p>
                    </div>

                    <div className="flex gap-3">
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
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700"
                        >
                            <Plus size={18} />
                            Nova conta
                        </button>
                    </div>
                </header>

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
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 pl-11 pr-4 outline-none focus:border-emerald-500"
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
                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-emerald-500"
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
                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-emerald-500"
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

                                <select
                                    value={supplierFilter}
                                    onChange={(event) =>
                                        setSupplierFilter(event.target.value)
                                    }
                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 outline-none focus:border-emerald-500"
                                >
                                    <option value="">
                                        Todos os fornecedores
                                    </option>

                                    {suppliers.map((supplier) => (
                                        <option
                                            key={supplier.id}
                                            value={supplier.id}
                                        >
                                            {supplier.name}
                                        </option>
                                    ))}
                                </select>
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
                        <div className="space-y-4">
                            {filteredBills.map((bill) => (
                                <BillCard
                                    key={bill.id}
                                    bill={bill}
                                    processing={
                                        processingId === bill.id
                                    }
                                    onCopy={copyText}
                                    onPay={markAsPaid}
                                    onLaunch={markAsLaunched}
                                    onCancel={cancelBill}
                                    onOpenPurchase={(purchaseId) =>
                                        router.push(
                                            `/purchases/${purchaseId}`,
                                        )
                                    }
                                />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AppLayout>
    );
}

function BillCard({
    bill,
    processing,
    onCopy,
    onPay,
    onLaunch,
    onCancel,
    onOpenPurchase,
}: {
    bill: Bill;
    processing: boolean;

    onCopy: (
        value: string | null | undefined,
        message: string,
    ) => Promise<void>;

    onPay: (bill: Bill) => Promise<void>;
    onLaunch: (bill: Bill) => Promise<void>;
    onCancel: (bill: Bill) => Promise<void>;
    onOpenPurchase: (purchaseId: string) => void;
}) {
    const displayStatus = getDisplayStatus(bill);
    const isInactive =
        displayStatus === 'PAID' ||
        displayStatus === 'CANCELED';

    return (
        <article
            className={`rounded-3xl border p-5 ${displayStatus === 'OVERDUE'
                ? 'border-red-500/30 bg-red-500/[0.04]'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                }`}
        >
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
                            <ReceiptText size={19} />
                        </div>

                        <h4 className="text-lg font-semibold">
                            {bill.description}
                        </h4>

                        <span
                            className={`rounded-full border px-3 py-1 text-xs font-medium ${billStatusColor[displayStatus] ||
                                billStatusColor.OPEN
                                }`}
                        >
                            {billStatusLabel[displayStatus] ||
                                displayStatus}
                        </span>

                        <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-400">
                            {paymentMethodLabel[
                                bill.paymentMethod
                            ] ||
                                billTypeLabel[bill.type] ||
                                bill.paymentMethod}
                        </span>
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
                            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20"
                        >
                            <ExternalLink size={16} />
                            Abrir compra:{' '}
                            {bill.purchase.description}
                        </button>
                    )}

                    <PaymentDetails
                        bill={bill}
                        onCopy={onCopy}
                    />

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
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-500/20"
                            >
                                <CheckCircle2 size={16} />
                                Abrir comprovante
                            </a>
                        )}

                        <span
                            className={`rounded-xl border px-3 py-2 text-sm ${bill.externalLaunchStatus ===
                                'LAUNCHED'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                                }`}
                        >
                            {bill.externalLaunchStatus ===
                                'LAUNCHED'
                                ? `Lançado${bill.externalSystemName
                                    ? ` no ${bill.externalSystemName}`
                                    : ''
                                }${bill.externalCode
                                    ? ` • ${bill.externalCode}`
                                    : ''
                                }`
                                : 'Sem lançamento no OMIE'}
                        </span>
                    </div>

                    <p className="mt-3 text-xs text-zinc-600">
                        Cadastrada por {bill.launchedBy.name} em{' '}
                        {formatDate(bill.createdAt)}
                    </p>
                </div>

                <div className="min-w-[260px] border-t border-zinc-200 dark:border-zinc-800 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                    <p className="text-sm text-zinc-500">
                        Valor da conta
                    </p>

                    <strong className="mt-1 block text-3xl text-cyan-400">
                        {formatCurrency(bill.value)}
                    </strong>

                    {bill.paidAt && (
                        <p className="mt-1 text-xs text-emerald-400">
                            Pago em {formatDate(bill.paidAt)}
                        </p>
                    )}

                    <div className="mt-5 grid grid-cols-1 gap-2">
                        {!isInactive && (
                            <button
                                type="button"
                                disabled={processing}
                                onClick={() => onPay(bill)}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <Check size={17} />
                                Marcar como paga
                            </button>
                        )}

                        {bill.externalLaunchStatus !==
                            'LAUNCHED' &&
                            displayStatus !== 'CANCELED' && (
                                <button
                                    type="button"
                                    disabled={processing}
                                    onClick={() =>
                                        onLaunch(bill)
                                    }
                                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
                                >
                                    <ExternalLink size={17} />
                                    Marcar lançada no OMIE
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
            </div>
        </article>
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

