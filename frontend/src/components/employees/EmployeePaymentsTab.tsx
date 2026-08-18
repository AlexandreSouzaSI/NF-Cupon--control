'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    AlertTriangle,
    Calendar,
    CalendarDays,
    CheckCircle2,
    Clock,
    FileText,
    Loader2,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    Upload,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

type EmployeePaymentType =
    | 'ADIANTAMENTO'
    | 'PAGAMENTO'
    | 'VALE_TRANSPORTE'
    | 'PREMIACAO'
    | 'DECIMO_TERCEIRO'
    | 'FERIAS'
    | 'RESCISAO'
    | 'OUTRO';

type EmployeePaymentStatus = 'OPEN' | 'PAID' | 'CANCELED';

const TYPE_LABELS: Record<EmployeePaymentType, string> = {
    ADIANTAMENTO: 'Adiantamento',
    PAGAMENTO: 'Pagamento',
    VALE_TRANSPORTE: 'Vale transporte',
    PREMIACAO: 'Premiação',
    DECIMO_TERCEIRO: '13º Salário',
    FERIAS: 'Férias',
    RESCISAO: 'Rescisão',
    OUTRO: 'Outro',
};

// Tipos que fazem sentido lançar manualmente. Adiantamento e Pagamento são
// sempre gerados automaticamente a partir do cadastro do funcionário — o
// vale-transporte também é automático quando o funcionário tem Pagamento
// configurado (o valor entra somado no lançamento de Pagamento), mas fica
// disponível aqui pra casos avulsos (ex.: funcionário sem dia de Pagamento
// fixo).
const MANUAL_TYPES: EmployeePaymentType[] = [
    'VALE_TRANSPORTE',
    'DECIMO_TERCEIRO',
    'FERIAS',
    'RESCISAO',
    'OUTRO',
];

type Employee = {
    id: string;
    name: string;
    role?: string | null;
};

type Payment = {
    id: string;
    type: EmployeePaymentType;
    value: string;
    dueDate: string;
    paidAt?: string | null;
    status: EmployeePaymentStatus;
    referenceMonth?: string | null;
    notes?: string | null;
    receiptFileUrl?: string | null;
    employee: {
        id: string;
        name: string;
        role?: string | null;
    };
};

type PeriodKey = 'OVERDUE' | 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

const periodCards: {
    key: PeriodKey;
    label: string;
    icon: typeof AlertTriangle;
    activeClass: string;
}[] = [
    {
        key: 'OVERDUE',
        label: 'Vencidos',
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

const statusColor: Record<string, string> = {
    OPEN: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
    PAID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    OVERDUE: 'border-red-500/30 bg-red-500/10 text-red-400',
};

function formatCurrency(value: string | number) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) return '-';

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
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfToday() {
    const date = startOfToday();
    date.setHours(23, 59, 59, 999);
    return date;
}

function endOfRollingWeek() {
    const date = startOfToday();
    date.setDate(date.getDate() + 6);
    date.setHours(23, 59, 59, 999);
    return date;
}

function endOfCurrentMonth() {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getDisplayStatus(payment: Payment) {
    if (
        payment.status === 'OPEN' &&
        normalizeDate(payment.dueDate) < startOfToday()
    ) {
        return 'OVERDUE';
    }

    return payment.status;
}

function matchesPeriod(payment: Payment, period: PeriodKey): boolean {
    const displayStatus = getDisplayStatus(payment);

    if (period === 'OVERDUE') {
        return displayStatus === 'OVERDUE';
    }

    if (displayStatus !== 'OPEN') {
        return false;
    }

    if (period === 'ALL') {
        return true;
    }

    const dueDate = normalizeDate(payment.dueDate);
    const today = startOfToday();

    if (period === 'TODAY') {
        return dueDate >= today && dueDate <= endOfToday();
    }

    if (period === 'WEEK') {
        return dueDate >= today && dueDate <= endOfRollingWeek();
    }

    return dueDate >= today && dueDate <= endOfCurrentMonth();
}

export function EmployeePaymentsTab() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    const [periodFilter, setPeriodFilter] = useState<PeriodKey>('ALL');
    const [typeFilter, setTypeFilter] = useState('');

    const [payingId, setPayingId] = useState<string | null>(null);
    const [payFile, setPayFile] = useState<File | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [editDueDate, setEditDueDate] = useState('');
    const [editNotes, setEditNotes] = useState('');

    const [showManualForm, setShowManualForm] = useState(false);
    const [manualEmployeeId, setManualEmployeeId] = useState('');
    const [manualType, setManualType] =
        useState<EmployeePaymentType>('DECIMO_TERCEIRO');
    const [manualValue, setManualValue] = useState('');
    const [manualDueDate, setManualDueDate] = useState('');
    const [manualNotes, setManualNotes] = useState('');
    const [savingManual, setSavingManual] = useState(false);

    async function loadEmployees() {
        try {
            const response = await api.get('/employees', {
                params: { storeId: getActiveStore()?.id || undefined },
            });

            setEmployees(response.data || []);
        } catch {
            // Lista de funcionários é só pro formulário manual — se falhar,
            // a tela de pagamentos continua utilizável.
        }
    }

    async function loadPayments() {
        try {
            setLoading(true);

            const response = await api.get('/employees/payments', {
                params: { storeId: getActiveStore()?.id || undefined },
            });

            setPayments(response.data || []);
        } catch {
            toast.error('Erro ao carregar pagamentos.');
        } finally {
            setLoading(false);
        }
    }

    async function ensureLaunches() {
        try {
            setGenerating(true);

            await api.post('/employees/generate-launches', null, {
                params: { storeId: getActiveStore()?.id || undefined },
            });
        } catch {
            // Se a geração falhar, ainda mostramos os lançamentos já
            // existentes — não é um erro bloqueante pro usuário.
        } finally {
            setGenerating(false);
        }
    }

    useEffect(() => {
        (async () => {
            await ensureLaunches();
            await Promise.all([loadPayments(), loadEmployees()]);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const periodTotals = useMemo(() => {
        const periods: PeriodKey[] = [
            'OVERDUE',
            'TODAY',
            'WEEK',
            'MONTH',
            'ALL',
        ];

        const result: Record<PeriodKey, { count: number; value: number }> = {
            OVERDUE: { count: 0, value: 0 },
            TODAY: { count: 0, value: 0 },
            WEEK: { count: 0, value: 0 },
            MONTH: { count: 0, value: 0 },
            ALL: { count: 0, value: 0 },
        };

        for (const payment of payments) {
            const value = Number(payment.value);

            for (const period of periods) {
                if (matchesPeriod(payment, period)) {
                    result[period].count += 1;
                    result[period].value += value;
                }
            }
        }

        return result;
    }, [payments]);

    const filteredPayments = useMemo(() => {
        return payments
            .filter((payment) =>
                typeFilter ? payment.type === typeFilter : true,
            )
            .filter((payment) => matchesPeriod(payment, periodFilter))
            .sort(
                (a, b) =>
                    new Date(a.dueDate).getTime() -
                    new Date(b.dueDate).getTime(),
            );
    }, [payments, typeFilter, periodFilter]);

    function startPay(payment: Payment) {
        setPayingId(payment.id);
        setPayFile(null);
    }

    async function confirmPay(payment: Payment) {
        try {
            setProcessingId(payment.id);

            const formData = new FormData();
            if (payFile) {
                formData.append('file', payFile);
            }

            await api.post(
                `/employees/payments/${payment.id}/pay`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                },
            );

            toast.success('Pagamento confirmado.');
            setPayingId(null);
            setPayFile(null);
            await loadPayments();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao confirmar pagamento.',
            );
        } finally {
            setProcessingId(null);
        }
    }

    async function reopenPayment(payment: Payment) {
        const confirmed = confirm(
            `Reabrir o lançamento de ${TYPE_LABELS[payment.type]} de ${payment.employee.name}?`,
        );

        if (!confirmed) return;

        try {
            setProcessingId(payment.id);
            await api.post(`/employees/payments/${payment.id}/reopen`);
            toast.success('Lançamento reaberto.');
            await loadPayments();
        } catch {
            toast.error('Erro ao reabrir lançamento.');
        } finally {
            setProcessingId(null);
        }
    }

    async function removePayment(payment: Payment) {
        const confirmed = confirm(
            `Excluir o lançamento de ${TYPE_LABELS[payment.type]} de ${payment.employee.name}?`,
        );

        if (!confirmed) return;

        try {
            setProcessingId(payment.id);
            await api.delete(`/employees/payments/${payment.id}`);
            toast.success('Lançamento excluído.');
            await loadPayments();
        } catch {
            toast.error('Erro ao excluir lançamento.');
        } finally {
            setProcessingId(null);
        }
    }

    function startEdit(payment: Payment) {
        setEditingId(payment.id);
        setEditValue(payment.value);
        setEditDueDate(payment.dueDate.slice(0, 10));
        setEditNotes(payment.notes || '');
    }

    async function saveEdit(payment: Payment) {
        try {
            setProcessingId(payment.id);

            await api.put(`/employees/payments/${payment.id}`, {
                value: editValue ? Number(editValue) : undefined,
                dueDate: editDueDate || undefined,
                notes: editNotes.trim() || undefined,
            });

            toast.success('Lançamento atualizado.');
            setEditingId(null);
            await loadPayments();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao atualizar lançamento.',
            );
        } finally {
            setProcessingId(null);
        }
    }

    function resetManualForm() {
        setManualEmployeeId('');
        setManualType('DECIMO_TERCEIRO');
        setManualValue('');
        setManualDueDate('');
        setManualNotes('');
    }

    async function handleCreateManual(e: React.FormEvent) {
        e.preventDefault();

        if (!manualEmployeeId) {
            toast.error('Selecione o funcionário.');
            return;
        }

        if (!manualValue || Number(manualValue) <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }

        if (!manualDueDate) {
            toast.error('Informe a data do lançamento.');
            return;
        }

        try {
            setSavingManual(true);

            const formData = new FormData();
            formData.append('employeeId', manualEmployeeId);
            formData.append('type', manualType);
            formData.append('value', manualValue);
            formData.append('dueDate', manualDueDate);
            if (manualNotes.trim()) {
                formData.append('notes', manualNotes.trim());
            }

            await api.post('/employees/payments', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            toast.success('Lançamento criado.');
            resetManualForm();
            setShowManualForm(false);
            await loadPayments();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao criar lançamento.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSavingManual(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {periodCards.map((card) => {
                    const Icon = card.icon;
                    const isActive = periodFilter === card.key;
                    const stats = periodTotals[card.key];

                    return (
                        <button
                            key={card.key}
                            onClick={() => setPeriodFilter(card.key)}
                            className={`rounded-2xl border p-4 text-left transition ${isActive
                                ? card.activeClass
                                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                }`}
                        >
                            <Icon size={18} />
                            <p className="mt-2 text-sm">{card.label}</p>
                            <p className="text-lg font-bold">
                                {stats.count}
                            </p>
                            <p className="text-xs opacity-80">
                                {formatCurrency(stats.value)}
                            </p>
                        </button>
                    );
                })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                    >
                        <option value="">Todos os tipos</option>
                        {Object.entries(TYPE_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>

                    {generating && (
                        <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                            <Loader2 size={14} className="animate-spin" />
                            Gerando lançamentos do mês...
                        </span>
                    )}
                </div>

                <button
                    onClick={() => setShowManualForm((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600"
                >
                    <Plus size={16} />
                    Lançamento avulso
                </button>
            </div>

            {showManualForm && (
                <form
                    onSubmit={handleCreateManual}
                    className="grid grid-cols-1 gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:grid-cols-2 lg:grid-cols-5"
                >
                    <div>
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Funcionário
                        </label>
                        <select
                            value={manualEmployeeId}
                            onChange={(e) =>
                                setManualEmployeeId(e.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        >
                            <option value="">Selecione</option>
                            {employees.map((employee) => (
                                <option key={employee.id} value={employee.id}>
                                    {employee.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Tipo
                        </label>
                        <select
                            value={manualType}
                            onChange={(e) =>
                                setManualType(
                                    e.target.value as EmployeePaymentType,
                                )
                            }
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        >
                            {MANUAL_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {TYPE_LABELS[type]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Valor
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={manualValue}
                            onChange={(e) => setManualValue(e.target.value)}
                            placeholder="0,00"
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Data
                        </label>
                        <input
                            type="date"
                            value={manualDueDate}
                            onChange={(e) =>
                                setManualDueDate(e.target.value)
                            }
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Observações
                        </label>
                        <input
                            value={manualNotes}
                            onChange={(e) => setManualNotes(e.target.value)}
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-5 flex gap-3">
                        <button
                            disabled={savingManual}
                            className="h-11 rounded-xl bg-green-500 px-5 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {savingManual ? 'Salvando...' : 'Criar lançamento'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowManualForm(false)}
                            className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : filteredPayments.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhum lançamento encontrado nesse filtro.
                </p>
            ) : (
                <div className="space-y-3">
                    {filteredPayments.map((payment) => {
                        const displayStatus = getDisplayStatus(payment);
                        const isPaying = payingId === payment.id;
                        const isEditing = editingId === payment.id;
                        const isProcessing = processingId === payment.id;

                        return (
                            <div
                                key={payment.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
                            >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="font-semibold">
                                            {payment.employee.name}
                                            {payment.employee.role &&
                                                ` • ${payment.employee.role}`}
                                        </p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            {TYPE_LABELS[payment.type]}
                                            {payment.referenceMonth &&
                                                ` • Competência ${payment.referenceMonth}`}
                                        </p>
                                        {payment.notes && (
                                            <p className="mt-1 text-xs text-zinc-500">
                                                {payment.notes}
                                            </p>
                                        )}
                                        <p className="mt-2 text-lg font-bold text-orange-400">
                                            {formatCurrency(payment.value)}
                                        </p>
                                    </div>

                                    <div className="flex flex-col items-start gap-2 lg:items-end">
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${statusColor[displayStatus]}`}
                                        >
                                            {displayStatus === 'PAID'
                                                ? `Pago em ${formatDate(payment.paidAt)}`
                                                : displayStatus === 'OVERDUE'
                                                    ? `Venceu em ${formatDate(payment.dueDate)}`
                                                    : `Vence em ${formatDate(payment.dueDate)}`}
                                        </span>

                                        <div className="flex flex-wrap justify-end gap-2">
                                            {payment.receiptFileUrl && (
                                                <a
                                                    href={`${API_URL}${payment.receiptFileUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                                                >
                                                    <FileText size={14} />
                                                    Comprovante
                                                </a>
                                            )}

                                            {payment.status === 'OPEN' ? (
                                                <button
                                                    disabled={isProcessing}
                                                    onClick={() =>
                                                        startPay(payment)
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 size={14} />
                                                    Marcar pago
                                                </button>
                                            ) : (
                                                <button
                                                    disabled={isProcessing}
                                                    onClick={() =>
                                                        reopenPayment(payment)
                                                    }
                                                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                >
                                                    <RotateCcw size={14} />
                                                    Reabrir
                                                </button>
                                            )}

                                            <button
                                                disabled={isProcessing}
                                                onClick={() =>
                                                    startEdit(payment)
                                                }
                                                title="Editar"
                                                className="rounded-lg border border-zinc-300 dark:border-zinc-700 p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                <Pencil size={14} />
                                            </button>

                                            <button
                                                disabled={isProcessing}
                                                onClick={() =>
                                                    removePayment(payment)
                                                }
                                                title="Excluir"
                                                className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {isPaying && (
                                    <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 sm:flex-row sm:items-center">
                                        <label className="flex h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-600 dark:text-zinc-400">
                                            <Upload size={14} />
                                            {payFile
                                                ? payFile.name
                                                : 'Comprovante (opcional)'}
                                            <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="hidden"
                                                onChange={(e) =>
                                                    setPayFile(
                                                        e.target.files?.[0] ||
                                                        null,
                                                    )
                                                }
                                            />
                                        </label>

                                        <div className="flex gap-2">
                                            <button
                                                disabled={isProcessing}
                                                onClick={() =>
                                                    confirmPay(payment)
                                                }
                                                className="h-10 rounded-xl bg-green-500 px-4 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                                            >
                                                {isProcessing
                                                    ? 'Confirmando...'
                                                    : 'Confirmar'}
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setPayingId(null);
                                                    setPayFile(null);
                                                }}
                                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {isEditing && (
                                    <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 sm:grid-cols-4">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={editValue}
                                            onChange={(e) =>
                                                setEditValue(e.target.value)
                                            }
                                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                        />

                                        <input
                                            type="date"
                                            value={editDueDate}
                                            onChange={(e) =>
                                                setEditDueDate(e.target.value)
                                            }
                                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                        />

                                        <input
                                            value={editNotes}
                                            onChange={(e) =>
                                                setEditNotes(e.target.value)
                                            }
                                            placeholder="Observações"
                                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                        />

                                        <div className="flex gap-2">
                                            <button
                                                disabled={isProcessing}
                                                onClick={() =>
                                                    saveEdit(payment)
                                                }
                                                className="h-10 flex-1 rounded-xl bg-green-500 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                                            >
                                                Salvar
                                            </button>

                                            <button
                                                onClick={() =>
                                                    setEditingId(null)
                                                }
                                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
