'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    ListChecks,
    Pencil,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

const MANAGE_ROLES = ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'];

type Recurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE';
type OccurrenceStatus = 'PENDING' | 'DONE' | 'LATE';

const RECURRENCE_LABELS: Record<Recurrence, string> = {
    DAILY: 'Diária',
    WEEKLY: 'Semanal',
    MONTHLY: 'Mensal',
    ONCE: 'Ocasional',
};

const WEEKDAY_LABELS = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
];

type TaskDef = {
    id: string;
    title: string;
    description: string | null;
    recurrence: Recurrence;
    weekday: number | null;
    dayOfMonth: number | null;
    dueDate: string | null;
    active: boolean;
    store: { id: string; name: string };
    assignedTo: { id: string; name: string };
    createdBy: { id: string; name: string };
};

type Occurrence = {
    id: string;
    dueDate: string;
    status: OccurrenceStatus;
    confirmedAt: string | null;
    task: {
        id: string;
        title: string;
        description: string | null;
        recurrence: Recurrence;
        storeId: string;
        assignedTo: { id: string; name: string };
    };
    confirmedBy: { id: string; name: string } | null;
};

type UserOption = {
    id: string;
    name: string;
    active: boolean;
    userStores: { store: { id: string; name: string } }[];
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

function recurrenceDetail(task: Pick<TaskDef, 'recurrence' | 'weekday' | 'dayOfMonth' | 'dueDate'>) {
    if (task.recurrence === 'WEEKLY' && task.weekday !== null) {
        return `Toda ${WEEKDAY_LABELS[task.weekday]}`;
    }

    if (task.recurrence === 'MONTHLY' && task.dayOfMonth !== null) {
        return `Todo dia ${task.dayOfMonth}`;
    }

    if (task.recurrence === 'ONCE' && task.dueDate) {
        return formatDate(task.dueDate);
    }

    return RECURRENCE_LABELS[task.recurrence];
}

export default function TasksPage() {
    const user = getUser();
    const canManage = !!user && MANAGE_ROLES.includes(user.role);

    const [tab, setTab] = useState<'quadro' | 'gerenciar'>('quadro');

    return (
        <AppLayout title="Tarefas">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Tarefas</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Quadro de tarefas da loja ativa, diárias, semanais,
                        mensais ou ocasionais.
                    </p>
                </div>

                {canManage && (
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                        <button
                            onClick={() => setTab('quadro')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'quadro'
                                ? 'bg-emerald-600 text-white'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                        >
                            <ListChecks size={16} />
                            Quadro
                        </button>
                        <button
                            onClick={() => setTab('gerenciar')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'gerenciar'
                                ? 'bg-emerald-600 text-white'
                                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                }`}
                        >
                            <Plus size={16} />
                            Gerenciar tarefas
                        </button>
                    </div>
                )}

                {tab === 'quadro' ? (
                    <QuadroTab currentUserId={user?.id || ''} canManage={canManage} />
                ) : (
                    <GerenciarTab />
                )}
            </div>
        </AppLayout>
    );
}

function StatusBadge({ status }: { status: OccurrenceStatus }) {
    if (status === 'DONE') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
                <CheckCircle2 size={13} />
                Concluída
            </span>
        );
    }

    if (status === 'LATE') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400">
                <AlertTriangle size={13} />
                Atrasada
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-3 py-1 text-xs font-medium text-zinc-500">
            <Clock size={13} />
            Pendente
        </span>
    );
}

function QuadroTab({
    currentUserId,
    canManage,
}: {
    currentUserId: string;
    canManage: boolean;
}) {
    const [filter, setFilter] = useState<'pendentes' | 'concluidas' | 'todas'>(
        'pendentes',
    );
    const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const status =
                filter === 'pendentes'
                    ? 'PENDING,LATE'
                    : filter === 'concluidas'
                        ? 'DONE'
                        : undefined;

            const response = await api.get('/tasks/occurrences', {
                params: { storeId: store.id, status },
            });

            setOccurrences(response.data);
        } catch {
            toast.error('Erro ao carregar tarefas.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter]);

    async function handleConfirm(occurrence: Occurrence) {
        try {
            setActingId(occurrence.id);
            await api.post(`/tasks/occurrences/${occurrence.id}/confirm`);
            toast.success('Tarefa confirmada.');
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao confirmar tarefa.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setActingId(null);
        }
    }

    async function handleUndo(occurrence: Occurrence) {
        const confirmed = confirm('Desfazer a confirmação dessa tarefa?');

        if (!confirmed) return;

        try {
            setActingId(occurrence.id);
            await api.post(`/tasks/occurrences/${occurrence.id}/undo`);
            toast.success('Confirmação desfeita.');
            await load();
        } catch {
            toast.error('Erro ao desfazer confirmação.');
        } finally {
            setActingId(null);
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                {(
                    [
                        { key: 'pendentes', label: 'Pendentes' },
                        { key: 'concluidas', label: 'Concluídas' },
                        { key: 'todas', label: 'Todas' },
                    ] as const
                ).map((option) => (
                    <button
                        key={option.key}
                        onClick={() => setFilter(option.key)}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${filter === option.key
                            ? 'bg-emerald-600 text-white'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : occurrences.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma tarefa por aqui.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {occurrences.map((occurrence) => {
                        const canConfirmThis =
                            occurrence.status !== 'DONE' &&
                            (canManage || occurrence.task.assignedTo.id === currentUserId);
                        const acting = actingId === occurrence.id;

                        return (
                            <div
                                key={occurrence.id}
                                className="flex flex-col gap-3 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold leading-snug">
                                        {occurrence.task.title}
                                    </h3>
                                    <StatusBadge status={occurrence.status} />
                                </div>

                                {occurrence.task.description && (
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {occurrence.task.description}
                                    </p>
                                )}

                                <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                                    <p>
                                        Responsável:{' '}
                                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                            {occurrence.task.assignedTo.name}
                                        </span>
                                    </p>
                                    <p>
                                        Prazo:{' '}
                                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                            {formatDate(occurrence.dueDate)}
                                        </span>
                                    </p>
                                    <p>{RECURRENCE_LABELS[occurrence.task.recurrence]}</p>
                                    {occurrence.status === 'DONE' && occurrence.confirmedBy && (
                                        <p>
                                            Confirmado por{' '}
                                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                                                {occurrence.confirmedBy.name}
                                            </span>
                                        </p>
                                    )}
                                </div>

                                <div className="mt-auto flex gap-2 pt-2">
                                    {canConfirmThis && (
                                        <button
                                            onClick={() => handleConfirm(occurrence)}
                                            disabled={acting}
                                            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                        >
                                            {acting ? 'Confirmando...' : 'Confirmar'}
                                        </button>
                                    )}

                                    {occurrence.status === 'DONE' && canManage && (
                                        <button
                                            onClick={() => handleUndo(occurrence)}
                                            disabled={acting}
                                            title="Desfazer confirmação"
                                            className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const EMPTY_FORM = {
    title: '',
    description: '',
    assignedToId: '',
    recurrence: 'DAILY' as Recurrence,
    weekday: '2',
    dayOfMonth: '1',
    dueDate: '',
};

function GerenciarTab() {
    const [tasks, setTasks] = useState<TaskDef[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);

    const activeStore = getActiveStore();

    const storeUsers = useMemo(
        () =>
            users.filter(
                (u) =>
                    u.active &&
                    activeStore &&
                    u.userStores.some((item) => item.store.id === activeStore.id),
            ),
        [users, activeStore],
    );

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const [tasksRes, usersRes] = await Promise.all([
                api.get('/tasks', { params: { storeId: store.id, active: true } }),
                api.get('/users'),
            ]);

            setTasks(tasksRes.data);
            setUsers(usersRes.data);
        } catch {
            toast.error('Erro ao carregar tarefas.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function resetForm() {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
    }

    function startCreate() {
        resetForm();
        setShowForm(true);
    }

    function startEdit(task: TaskDef) {
        setEditingId(task.id);
        setForm({
            title: task.title,
            description: task.description || '',
            assignedToId: task.assignedTo.id,
            recurrence: task.recurrence,
            weekday: task.weekday !== null ? String(task.weekday) : '2',
            dayOfMonth: task.dayOfMonth !== null ? String(task.dayOfMonth) : '1',
            dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
        });
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!form.title.trim()) {
            toast.error('Informe o título da tarefa.');
            return;
        }

        if (!form.assignedToId) {
            toast.error('Escolha o responsável.');
            return;
        }

        if (form.recurrence === 'ONCE' && !form.dueDate) {
            toast.error('Informe a data da tarefa ocasional.');
            return;
        }

        const payload: any = {
            title: form.title,
            description: form.description || undefined,
            storeId: store.id,
            assignedToId: form.assignedToId,
            recurrence: form.recurrence,
        };

        if (form.recurrence === 'WEEKLY') {
            payload.weekday = Number(form.weekday);
        }

        if (form.recurrence === 'MONTHLY') {
            payload.dayOfMonth = Number(form.dayOfMonth);
        }

        if (form.recurrence === 'ONCE') {
            payload.dueDate = form.dueDate;
        }

        try {
            setSaving(true);

            if (editingId) {
                await api.put(`/tasks/${editingId}`, payload);
                toast.success('Tarefa atualizada.');
            } else {
                await api.post('/tasks', payload);
                toast.success('Tarefa cadastrada.');
            }

            resetForm();
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar tarefa.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(task: TaskDef) {
        const confirmed = confirm(`Remover a tarefa "${task.title}"?`);

        if (!confirmed) return;

        try {
            await api.delete(`/tasks/${task.id}`);
            toast.success('Tarefa removida.');
            await load();
        } catch {
            toast.error('Erro ao remover tarefa.');
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold">Tarefas cadastradas</h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Loja ativa no topo do sistema
                    </p>
                </div>

                {!showForm && (
                    <button
                        onClick={startCreate}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                        <Plus size={16} />
                        Nova tarefa
                    </button>
                )}
            </div>

            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold">
                            {editingId ? 'Editar tarefa' : 'Nova tarefa'}
                        </h4>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Título
                            </label>
                            <input
                                value={form.title}
                                onChange={(e) =>
                                    setForm({ ...form, title: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Descrição (opcional)
                            </label>
                            <input
                                value={form.description}
                                onChange={(e) =>
                                    setForm({ ...form, description: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Responsável
                            </label>
                            <select
                                value={form.assignedToId}
                                onChange={(e) =>
                                    setForm({ ...form, assignedToId: e.target.value })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                            >
                                <option value="">Selecione...</option>
                                {storeUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                        {u.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Frequência
                            </label>
                            <select
                                value={form.recurrence}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        recurrence: e.target.value as Recurrence,
                                    })
                                }
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                            >
                                <option value="DAILY">Diária</option>
                                <option value="WEEKLY">Semanal</option>
                                <option value="MONTHLY">Mensal</option>
                                <option value="ONCE">Ocasional</option>
                            </select>
                        </div>

                        {form.recurrence === 'WEEKLY' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Dia da semana
                                </label>
                                <select
                                    value={form.weekday}
                                    onChange={(e) =>
                                        setForm({ ...form, weekday: e.target.value })
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                >
                                    {WEEKDAY_LABELS.map((label, index) => (
                                        <option key={index} value={index}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {form.recurrence === 'MONTHLY' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Dia do mês
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={form.dayOfMonth}
                                    onChange={(e) =>
                                        setForm({ ...form, dayOfMonth: e.target.value })
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}

                        {form.recurrence === 'ONCE' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Data
                                </label>
                                <input
                                    type="date"
                                    value={form.dueDate}
                                    onChange={(e) =>
                                        setForm({ ...form, dueDate: e.target.value })
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                                />
                            </div>
                        )}
                    </div>

                    <button
                        disabled={saving}
                        className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 sm:w-auto sm:px-8"
                    >
                        {saving
                            ? 'Salvando...'
                            : editingId
                                ? 'Salvar alterações'
                                : 'Cadastrar tarefa'}
                    </button>
                </form>
            )}

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : tasks.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma tarefa cadastrada ainda pra essa loja.
                </p>
            ) : (
                <div className="space-y-3">
                    {tasks.map((task) => (
                        <div
                            key={task.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                        >
                            <div>
                                <p className="font-semibold">{task.title}</p>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {task.assignedTo.name} —{' '}
                                    {RECURRENCE_LABELS[task.recurrence]} (
                                    {recurrenceDetail(task)})
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => startEdit(task)}
                                    title="Editar"
                                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    <Pencil size={16} />
                                </button>

                                <button
                                    onClick={() => handleRemove(task)}
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
        </div>
    );
}
