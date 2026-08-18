'use client';

import { useEffect, useState } from 'react';
import type { ElementType } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import {
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    FileText,
    Loader2,
    Pencil,
    RotateCcw,
    ShieldAlert,
    Trash2,
    Users,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

const ALLOWED_ROLES = ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'];

type Freelancer = {
    id: string;
    name: string;
    defaultDailyValue: string;
    active: boolean;
    store: { id: string; name: string };
};

type WorkDay = {
    id: string;
    date: string;
    value: string | null;
};

type PaymentsSummary = {
    weekStart: string;
    weekEnd: string;
    freelancers: {
        id: string;
        name: string;
        defaultDailyValue: number;
        days: {
            date: string;
            weekday: number;
            value: number;
            isCustomValue: boolean;
        }[];
        sextaTotal: number;
        segundaTotal: number;
        sextaConfirmed: boolean;
        sextaPaymentId: string | null;
        segundaConfirmed: boolean;
        segundaPaymentId: string | null;
    }[];
    totalSexta: number;
    totalSegunda: number;
};

type FreelancerPayment = {
    id: string;
    freelancerId: string;
    group: 'SEXTA' | 'SEGUNDA';
    paymentDate: string;
    totalValue: string;
    workDaysSnapshot: { date: string; value: number }[];
    paidAt: string;
    freelancer: { id: string; name: string };
};

// Terça a Domingo, na ordem que aparece nas telas — segunda nunca entra
// aqui, é só o dia de pagamento do grupo sexta/sábado/domingo.
const WEEK_COLUMNS: { weekday: number; label: string }[] = [
    { weekday: 2, label: 'Terça' },
    { weekday: 3, label: 'Quarta' },
    { weekday: 4, label: 'Quinta' },
    { weekday: 5, label: 'Sexta' },
    { weekday: 6, label: 'Sábado' },
    { weekday: 0, label: 'Domingo' },
];

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function toIsoDate(date: Date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Acha a terça-feira da semana (segunda a domingo) que contém `date` —
// âncora usada em toda a tela pra identificar "a semana".
function tuesdayOfWeek(date: Date) {
    const isoDay = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const diff = 2 - isoDay;
    const result = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    result.setUTCDate(result.getUTCDate() + diff);
    return result;
}

function addDays(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function formatCurrency(value: number | string) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
    });
}

type TabKey = 'cadastro' | 'dias' | 'pagamentos' | 'relatorio';

export default function FreelancersPage() {
    const user = getUser();
    const allowed = !!user && ALLOWED_ROLES.includes(user.role);

    const [activeTab, setActiveTab] = useState<TabKey>('cadastro');

    return (
        <AppLayout title="Freelancer">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Freelancer</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Cadastro, dias trabalhados, quadro de pagamentos e
                        relatório de tudo que já foi pago, da loja ativa.
                    </p>
                </div>

                {!allowed ? (
                    <div className="flex flex-col items-center gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
                        <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                            <ShieldAlert size={22} />
                        </div>
                        <p className="font-semibold">Acesso restrito</p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Essa página só pode ser vista pelos perfis
                            Administrativo, Proprietário e Gerente.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                            <TabButton
                                active={activeTab === 'cadastro'}
                                onClick={() => setActiveTab('cadastro')}
                                icon={Users}
                                label="Cadastro"
                            />
                            <TabButton
                                active={activeTab === 'dias'}
                                onClick={() => setActiveTab('dias')}
                                icon={Calendar}
                                label="Dias Trabalhados"
                            />
                            <TabButton
                                active={activeTab === 'pagamentos'}
                                onClick={() => setActiveTab('pagamentos')}
                                icon={Wallet}
                                label="Pagamentos"
                            />
                            <TabButton
                                active={activeTab === 'relatorio'}
                                onClick={() => setActiveTab('relatorio')}
                                icon={FileText}
                                label="Relatório"
                            />
                        </div>

                        {activeTab === 'cadastro' && <CadastroTab />}
                        {activeTab === 'dias' && <DiasTrabalhadosTab />}
                        {activeTab === 'pagamentos' && <PagamentosTab />}
                        {activeTab === 'relatorio' && <RelatorioTab />}
                    </>
                )}
            </div>
        </AppLayout>
    );
}

function TabButton({
    active,
    onClick,
    icon: Icon,
    label,
}: {
    active: boolean;
    onClick: () => void;
    icon: ElementType;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${active
                ? 'bg-emerald-600 text-white'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
        >
            <Icon size={16} />
            {label}
        </button>
    );
}

function CadastroTab() {
    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', defaultDailyValue: '' });

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/freelancers', {
                params: { storeId: store.id, onlyActive: true },
            });

            setFreelancers(response.data);
        } catch {
            toast.error('Erro ao carregar freelancers.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function resetForm() {
        setForm({ name: '', defaultDailyValue: '' });
        setEditingId(null);
    }

    function startEdit(freelancer: Freelancer) {
        setEditingId(freelancer.id);
        setForm({
            name: freelancer.name,
            defaultDailyValue: String(freelancer.defaultDailyValue),
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!form.name.trim()) {
            toast.error('Informe o nome do freelancer.');
            return;
        }

        if (!form.defaultDailyValue || Number(form.defaultDailyValue) <= 0) {
            toast.error('Informe o valor padrão da diária.');
            return;
        }

        try {
            setSaving(true);

            if (editingId) {
                await api.put(`/freelancers/${editingId}`, {
                    name: form.name,
                    defaultDailyValue: Number(form.defaultDailyValue),
                });
                toast.success('Freelancer atualizado.');
            } else {
                await api.post('/freelancers', {
                    storeId: store.id,
                    name: form.name,
                    defaultDailyValue: Number(form.defaultDailyValue),
                });
                toast.success('Freelancer cadastrado.');
            }

            resetForm();
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar freelancer.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(freelancer: Freelancer) {
        const confirmed = confirm(
            `Remover o freelancer "${freelancer.name}"?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/freelancers/${freelancer.id}`);
            toast.success('Freelancer removido.');
            await load();
        } catch {
            toast.error('Erro ao remover freelancer.');
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
            <form
                onSubmit={handleSubmit}
                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-500">
                        <Users size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">
                            {editingId ? 'Editar freelancer' : 'Novo freelancer'}
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Nome
                        </label>
                        <input
                            value={form.name}
                            onChange={(e) =>
                                setForm({ ...form, name: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Valor padrão da diária (R$)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.defaultDailyValue}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    defaultDailyValue: e.target.value,
                                })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            className="h-12 flex-1 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {saving
                                ? 'Salvando...'
                                : editingId
                                    ? 'Salvar alterações'
                                    : 'Cadastrar freelancer'}
                        </button>

                        {editingId && (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Freelancers cadastrados
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                    <Users className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : freelancers.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum freelancer cadastrado ainda pra essa loja.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {freelancers.map((freelancer) => (
                            <div
                                key={freelancer.id}
                                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {freelancer.name}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Diária padrão:{' '}
                                        {formatCurrency(
                                            freelancer.defaultDailyValue,
                                        )}
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => startEdit(freelancer)}
                                        title="Editar"
                                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                        <Pencil size={16} />
                                    </button>

                                    <button
                                        onClick={() => handleRemove(freelancer)}
                                        title="Remover"
                                        className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function DiasTrabalhadosTab() {
    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [weekStart, setWeekStart] = useState<Date>(() =>
        tuesdayOfWeek(new Date()),
    );
    const [checked, setChecked] = useState<Record<number, boolean>>({});
    const [values, setValues] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    async function loadFreelancers() {
        const store = getActiveStore();

        if (!store) return;

        try {
            const response = await api.get('/freelancers', {
                params: { storeId: store.id, onlyActive: true },
            });

            setFreelancers(response.data);

            if (response.data.length > 0) {
                setSelectedId((current) => current || response.data[0].id);
            }
        } catch {
            toast.error('Erro ao carregar freelancers.');
        }
    }

    async function loadWorkDays() {
        if (!selectedId) return;

        try {
            setLoading(true);

            const response = await api.get<WorkDay[]>(
                `/freelancers/${selectedId}/work-days`,
                { params: { weekStart: toIsoDate(weekStart) } },
            );

            const newChecked: Record<number, boolean> = {};
            const newValues: Record<number, string> = {};

            for (const day of response.data) {
                const date = new Date(day.date);
                const weekday = date.getUTCDay();

                newChecked[weekday] = true;

                if (day.value !== null) {
                    newValues[weekday] = String(day.value);
                }
            }

            setChecked(newChecked);
            setValues(newValues);
        } catch {
            toast.error('Erro ao carregar dias trabalhados.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadFreelancers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadWorkDays();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, weekStart]);

    function toggleDay(weekday: number) {
        setChecked((prev) => ({ ...prev, [weekday]: !prev[weekday] }));
    }

    async function handleSave() {
        if (!selectedId) return;

        const days = WEEK_COLUMNS.filter((col) => checked[col.weekday]).map(
            (col) => {
                const dayIndex = WEEK_COLUMNS.findIndex(
                    (c) => c.weekday === col.weekday,
                );
                const date = addDays(weekStart, dayIndex);
                const rawValue = values[col.weekday];

                return {
                    date: toIsoDate(date),
                    value: rawValue ? Number(rawValue) : undefined,
                };
            },
        );

        try {
            setSaving(true);

            await api.put(`/freelancers/${selectedId}/work-days`, {
                weekStart: toIsoDate(weekStart),
                days,
            });

            toast.success('Dias trabalhados salvos.');
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar dias trabalhados.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    const selectedFreelancer = freelancers.find((f) => f.id === selectedId);
    const weekEnd = addDays(weekStart, 5);

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1">
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Freelancer
                    </label>
                    <select
                        value={selectedId || ''}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500 sm:max-w-xs"
                    >
                        {freelancers.length === 0 && (
                            <option value="">
                                Nenhum freelancer cadastrado
                            </option>
                        )}
                        {freelancers.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setWeekStart((w) => addDays(w, -7))}
                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <span className="whitespace-nowrap text-sm font-medium">
                        {formatShortDate(weekStart)} a {formatShortDate(weekEnd)}
                    </span>

                    <button
                        onClick={() => setWeekStart((w) => addDays(w, 7))}
                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {!selectedFreelancer ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Cadastre um freelancer primeiro na aba Cadastro.
                </p>
            ) : (
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-5">
                        <h3 className="text-lg font-bold">
                            {selectedFreelancer.name}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Diária padrão:{' '}
                            {formatCurrency(selectedFreelancer.defaultDailyValue)}{' '}
                            — marque os dias trabalhados nessa semana
                        </p>
                    </div>

                    {loading ? (
                        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <Loader2 size={14} className="animate-spin" />
                            Carregando...
                        </p>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
                            {WEEK_COLUMNS.map((col, index) => {
                                const date = addDays(weekStart, index);
                                const isChecked = !!checked[col.weekday];

                                return (
                                    <div
                                        key={col.weekday}
                                        className={`rounded-2xl border p-4 text-center transition ${isChecked
                                            ? 'border-emerald-500 bg-emerald-500/10'
                                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950'
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleDay(col.weekday)}
                                            className="w-full"
                                        >
                                            <p className="font-semibold">
                                                {col.label}
                                            </p>
                                            <p className="mb-2 text-xs text-zinc-500">
                                                {formatShortDate(date)}
                                            </p>
                                            <div
                                                className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl border-2 ${isChecked
                                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                                    : 'border-zinc-300 dark:border-zinc-700'
                                                    }`}
                                            >
                                                {isChecked && <Check size={20} />}
                                            </div>
                                        </button>

                                        {isChecked && (
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder={
                                                    selectedFreelancer.defaultDailyValue
                                                }
                                                value={values[col.weekday] || ''}
                                                onChange={(e) =>
                                                    setValues({
                                                        ...values,
                                                        [col.weekday]:
                                                            e.target.value,
                                                    })
                                                }
                                                className="mt-3 h-9 w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-center text-sm outline-none focus:border-emerald-500"
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <p className="mt-4 text-xs text-zinc-500">
                        Deixe o valor em branco pra usar a diária padrão do
                        cadastro. Preencha só quando esse dia específico pagar
                        diferente.
                    </p>

                    <button
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="mt-6 h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:px-8"
                    >
                        {saving ? 'Salvando...' : 'Salvar semana'}
                    </button>
                </div>
            )}
        </div>
    );
}

function PagamentosTab() {
    const [weekStart, setWeekStart] = useState<Date>(() =>
        tuesdayOfWeek(new Date()),
    );
    const [summary, setSummary] = useState<PaymentsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [confirmingKey, setConfirmingKey] = useState<string | null>(null);

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/freelancers/payments-summary', {
                params: { storeId: store.id, weekStart: toIsoDate(weekStart) },
            });

            setSummary(response.data);
        } catch {
            toast.error('Erro ao carregar quadro de pagamentos.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]);

    async function handleConfirm(freelancerId: string, group: 'SEXTA' | 'SEGUNDA') {
        const key = `${freelancerId}-${group}`;

        try {
            setConfirmingKey(key);

            await api.post(`/freelancers/${freelancerId}/payments/confirm`, {
                group,
                weekStart: toIsoDate(weekStart),
            });

            toast.success('Pagamento marcado como pago.');
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao confirmar pagamento.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setConfirmingKey(null);
        }
    }

    async function handleUndo(paymentId: string, freelancerId: string, group: 'SEXTA' | 'SEGUNDA') {
        const confirmed = confirm('Desfazer a confirmação desse pagamento?');

        if (!confirmed) return;

        const key = `${freelancerId}-${group}`;

        try {
            setConfirmingKey(key);
            await api.delete(`/freelancers/payments/${paymentId}`);
            toast.success('Confirmação desfeita.');
            await load();
        } catch {
            toast.error('Erro ao desfazer confirmação.');
        } finally {
            setConfirmingKey(null);
        }
    }

    const weekEnd = addDays(weekStart, 5);
    const fridayOfWeek = addDays(weekStart, 3);
    const mondayAfter = addDays(weekStart, 6);

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-bold">Quadro de pagamentos</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Semana de {formatShortDate(weekStart)} (terça) a{' '}
                        {formatShortDate(weekEnd)} (domingo)
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setWeekStart((w) => addDays(w, -7))}
                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronLeft size={18} />
                    </button>

                    <button
                        onClick={() => setWeekStart(tuesdayOfWeek(new Date()))}
                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        Semana atual
                    </button>

                    <button
                        onClick={() => setWeekStart((w) => addDays(w, 7))}
                        className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : !summary || summary.freelancers.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhum freelancer com dias lançados nessa semana.
                </p>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="text-left text-zinc-500">
                                    <th className="pb-3 font-medium">
                                        Freelancer
                                    </th>
                                    {WEEK_COLUMNS.map((col) => (
                                        <th
                                            key={col.weekday}
                                            className="pb-3 text-center font-medium"
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                    <th className="pb-3 text-right font-medium">
                                        Sexta
                                    </th>
                                    <th className="pb-3 text-right font-medium">
                                        Segunda
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.freelancers.map((freelancer) => (
                                    <tr
                                        key={freelancer.id}
                                        className="border-t border-zinc-100 dark:border-zinc-800"
                                    >
                                        <td className="py-3 font-medium">
                                            {freelancer.name}
                                        </td>
                                        {WEEK_COLUMNS.map((col) => {
                                            const day = freelancer.days.find(
                                                (d) => d.weekday === col.weekday,
                                            );

                                            return (
                                                <td
                                                    key={col.weekday}
                                                    className="py-3 text-center"
                                                >
                                                    {day ? (
                                                        <span
                                                            className="inline-flex text-emerald-500"
                                                            title={formatCurrency(
                                                                day.value,
                                                            )}
                                                        >
                                                            <Check size={18} />
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-300 dark:text-zinc-700">
                                                            —
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}

                                        <PaymentGroupCell
                                            total={freelancer.sextaTotal}
                                            confirmed={freelancer.sextaConfirmed}
                                            paymentId={freelancer.sextaPaymentId}
                                            loadingKey={confirmingKey === `${freelancer.id}-SEXTA`}
                                            onConfirm={() =>
                                                handleConfirm(freelancer.id, 'SEXTA')
                                            }
                                            onUndo={(paymentId) =>
                                                handleUndo(paymentId, freelancer.id, 'SEXTA')
                                            }
                                        />

                                        <PaymentGroupCell
                                            total={freelancer.segundaTotal}
                                            confirmed={freelancer.segundaConfirmed}
                                            paymentId={freelancer.segundaPaymentId}
                                            loadingKey={confirmingKey === `${freelancer.id}-SEGUNDA`}
                                            onConfirm={() =>
                                                handleConfirm(freelancer.id, 'SEGUNDA')
                                            }
                                            onUndo={(paymentId) =>
                                                handleUndo(paymentId, freelancer.id, 'SEGUNDA')
                                            }
                                        />
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Pagamentos para Sexta ({formatShortDate(fridayOfWeek)})
                                — Terça a Quinta
                            </p>
                            <p className="mt-1 text-3xl font-bold text-emerald-500">
                                {formatCurrency(summary.totalSexta)}
                            </p>
                        </div>

                        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Pagamentos para Segunda ({formatShortDate(mondayAfter)})
                                — Sexta a Domingo
                            </p>
                            <p className="mt-1 text-3xl font-bold text-emerald-500">
                                {formatCurrency(summary.totalSegunda)}
                            </p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// Célula de um grupo (sexta ou segunda) na tabela de pagamentos: mostra o
// subtotal e, dependendo do estado, o botão "Marcar como pago" ou o selo
// de confirmado com opção de desfazer.
function PaymentGroupCell({
    total,
    confirmed,
    paymentId,
    loadingKey,
    onConfirm,
    onUndo,
}: {
    total: number;
    confirmed: boolean;
    paymentId: string | null;
    loadingKey: boolean;
    onConfirm: () => void;
    onUndo: (paymentId: string) => void;
}) {
    if (total === 0) {
        return (
            <td className="py-3 text-right text-zinc-300 dark:text-zinc-700">
                —
            </td>
        );
    }

    return (
        <td className="py-3 text-right">
            <div className="flex items-center justify-end gap-2">
                <span className="font-semibold">{formatCurrency(total)}</span>

                {confirmed ? (
                    <button
                        onClick={() => paymentId && onUndo(paymentId)}
                        disabled={loadingKey}
                        title="Desfazer confirmação"
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                        <CheckCircle2 size={14} />
                        Pago
                        <RotateCcw size={12} className="ml-1" />
                    </button>
                ) : (
                    <button
                        onClick={onConfirm}
                        disabled={loadingKey}
                        className="rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                        {loadingKey ? 'Marcando...' : 'Marcar como pago'}
                    </button>
                )}
            </div>
        </td>
    );
}

function RelatorioTab() {
    const [mode, setMode] = useState<'dia' | 'freelancer'>('dia');
    const [payments, setPayments] = useState<FreelancerPayment[]>([]);
    const [freelancers, setFreelancers] = useState<Freelancer[]>([]);
    const [selectedFreelancerId, setSelectedFreelancerId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedDate, setExpandedDate] = useState<string | null>(null);

    async function loadPayments() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/freelancers/payments-report', {
                params: { storeId: store.id },
            });

            setPayments(response.data);
        } catch {
            toast.error('Erro ao carregar relatório de pagamentos.');
        } finally {
            setLoading(false);
        }
    }

    async function loadFreelancers() {
        const store = getActiveStore();

        if (!store) return;

        try {
            const response = await api.get('/freelancers', {
                params: { storeId: store.id },
            });

            setFreelancers(response.data);

            if (response.data.length > 0) {
                setSelectedFreelancerId((current) => current || response.data[0].id);
            }
        } catch {
            toast.error('Erro ao carregar freelancers.');
        }
    }

    useEffect(() => {
        loadPayments();
        loadFreelancers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Carregando...
            </p>
        );
    }

    if (payments.length === 0) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Nenhum pagamento confirmado ainda. Confirme pagamentos na aba
                Pagamentos pra eles aparecerem aqui.
            </p>
        );
    }

    // Agrupa por data de pagamento (chave "AAAA-MM-DD") pro modo "por dia".
    const byDate = new Map<string, FreelancerPayment[]>();
    for (const payment of payments) {
        const key = payment.paymentDate.slice(0, 10);
        const list = byDate.get(key) || [];
        list.push(payment);
        byDate.set(key, list);
    }
    const dateKeys = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));

    const freelancerPayments = payments
        .filter((p) => p.freelancerId === selectedFreelancerId)
        .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                <button
                    onClick={() => setMode('dia')}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'dia'
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                >
                    Por dia pago
                </button>
                <button
                    onClick={() => setMode('freelancer')}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${mode === 'freelancer'
                        ? 'bg-emerald-600 text-white'
                        : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                >
                    Por freelancer
                </button>
            </div>

            {mode === 'dia' ? (
                <div className="space-y-3">
                    {dateKeys.map((dateKey) => {
                        const dayPayments = byDate.get(dateKey) || [];
                        const total = dayPayments.reduce(
                            (sum, p) => sum + Number(p.totalValue),
                            0,
                        );
                        const isExpanded = expandedDate === dateKey;
                        const date = new Date(`${dateKey}T12:00:00.000Z`);

                        return (
                            <div
                                key={dateKey}
                                className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                            >
                                <button
                                    onClick={() =>
                                        setExpandedDate(isExpanded ? null : dateKey)
                                    }
                                    className="flex w-full items-center justify-between"
                                >
                                    <div className="text-left">
                                        <p className="font-semibold capitalize">
                                            {date.toLocaleDateString('pt-BR', {
                                                weekday: 'long',
                                                day: '2-digit',
                                                month: '2-digit',
                                                year: 'numeric',
                                                timeZone: 'UTC',
                                            })}
                                        </p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            {dayPayments.length} pagamento(s)
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className="text-xl font-bold text-emerald-500">
                                            {formatCurrency(total)}
                                        </span>
                                        {isExpanded ? (
                                            <ChevronUp size={18} />
                                        ) : (
                                            <ChevronDown size={18} />
                                        )}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="mt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                        {dayPayments.map((payment) => (
                                            <div
                                                key={payment.id}
                                                className="flex items-center justify-between rounded-xl bg-zinc-50 dark:bg-zinc-950 px-4 py-3"
                                            >
                                                <div>
                                                    <p className="font-medium">
                                                        {payment.freelancer.name}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        Grupo{' '}
                                                        {payment.group === 'SEXTA'
                                                            ? 'Sexta (terça a quinta)'
                                                            : 'Segunda (sexta a domingo)'}
                                                    </p>
                                                </div>
                                                <span className="font-semibold">
                                                    {formatCurrency(payment.totalValue)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-5">
                    <select
                        value={selectedFreelancerId || ''}
                        onChange={(e) => setSelectedFreelancerId(e.target.value)}
                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500 sm:max-w-xs"
                    >
                        {freelancers.map((f) => (
                            <option key={f.id} value={f.id}>
                                {f.name}
                            </option>
                        ))}
                    </select>

                    {freelancerPayments.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhum pagamento confirmado ainda pra esse freelancer.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {freelancerPayments.map((payment) => {
                                const date = new Date(payment.paymentDate);
                                const isExpanded = expandedDate === payment.id;

                                return (
                                    <div
                                        key={payment.id}
                                        className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                                    >
                                        <button
                                            onClick={() =>
                                                setExpandedDate(
                                                    isExpanded ? null : payment.id,
                                                )
                                            }
                                            className="flex w-full items-center justify-between"
                                        >
                                            <div className="text-left">
                                                <p className="font-semibold">
                                                    {formatShortDate(date)} — grupo{' '}
                                                    {payment.group === 'SEXTA'
                                                        ? 'Sexta'
                                                        : 'Segunda'}
                                                </p>
                                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                    {payment.workDaysSnapshot.length} dia(s)
                                                    trabalhado(s)
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className="text-xl font-bold text-emerald-500">
                                                    {formatCurrency(payment.totalValue)}
                                                </span>
                                                {isExpanded ? (
                                                    <ChevronUp size={18} />
                                                ) : (
                                                    <ChevronDown size={18} />
                                                )}
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="mt-4 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                                                {payment.workDaysSnapshot.map((day, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between rounded-xl bg-zinc-50 dark:bg-zinc-950 px-4 py-3"
                                                    >
                                                        <span className="text-sm">
                                                            {formatShortDate(
                                                                new Date(day.date),
                                                            )}
                                                        </span>
                                                        <span className="font-semibold">
                                                            {formatCurrency(day.value)}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
