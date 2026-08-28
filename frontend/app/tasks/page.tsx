'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    Clock,
    EyeOff,
    ListChecks,
    Paperclip,
    PauseCircle,
    Pencil,
    PlayCircle,
    Plus,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

const MANAGE_ROLES = ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE'];

type Recurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONCE';
type OccurrenceStatus =
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'PAUSED'
    | 'DONE'
    | 'LATE';

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
    attachmentUrl: string | null;
    attachmentName: string | null;
    restrictedFromAdministrativo: boolean;
    restrictedFromGerente: boolean;
    store: { id: string; name: string };
    assignedTo: { id: string; name: string };
    createdBy: { id: string; name: string };
};

type Occurrence = {
    id: string;
    dueDate: string;
    status: OccurrenceStatus;
    confirmedAt: string | null;
    notes: string | null;
    attachmentUrl: string | null;
    attachmentName: string | null;
    task: {
        id: string;
        title: string;
        description: string | null;
        recurrence: Recurrence;
        storeId: string;
        attachmentUrl: string | null;
        attachmentName: string | null;
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

type Store = {
    id: string;
    name: string;
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

    if (status === 'IN_PROGRESS') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
                <PlayCircle size={13} />
                Em andamento
            </span>
        );
    }

    if (status === 'PAUSED') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
                <PauseCircle size={13} />
                Pausada
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-3 py-1 text-xs font-medium text-zinc-500">
            <Clock size={13} />
            A fazer
        </span>
    );
}

// Pausada não é mais uma coluna própria — vira um estado do botão dentro
// do card, enquanto a tarefa continua na coluna "Em andamento".
const BOARD_COLUMNS: {
    key: string;
    label: string;
    statuses: OccurrenceStatus[];
}[] = [
        { key: 'todo', label: 'A fazer', statuses: ['PENDING', 'LATE'] },
        {
            key: 'doing',
            label: 'Em andamento',
            statuses: ['IN_PROGRESS', 'PAUSED'],
        },
        { key: 'done', label: 'Concluídas', statuses: ['DONE'] },
    ];

function QuadroTab({
    currentUserId,
    canManage,
}: {
    currentUserId: string;
    canManage: boolean;
}) {
    const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState<string | null>(null);
    const [confirmFormId, setConfirmFormId] = useState<string | null>(null);
    const [confirmNotes, setConfirmNotes] = useState('');
    const [confirmFile, setConfirmFile] = useState<File | null>(null);
    // No celular só mostra uma coluna por vez (trocada pelas abas abaixo);
    // do tablet pra cima, as 4 colunas ficam lado a lado, tipo Trello.
    const [activeColumn, setActiveColumn] = useState(BOARD_COLUMNS[0].key);

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/tasks/occurrences', {
                params: { storeId: store.id },
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
    }, []);

    function openConfirmForm(occurrenceId: string) {
        setConfirmFormId(occurrenceId);
        setConfirmNotes('');
        setConfirmFile(null);
    }

    function closeConfirmForm() {
        setConfirmFormId(null);
        setConfirmNotes('');
        setConfirmFile(null);
    }

    async function handleConfirm(occurrence: Occurrence) {
        const formData = new FormData();
        if (confirmNotes.trim()) formData.append('notes', confirmNotes.trim());
        if (confirmFile) formData.append('attachment', confirmFile);

        try {
            setActingId(occurrence.id);

            await api.post(
                `/tasks/occurrences/${occurrence.id}/confirm`,
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            toast.success('Tarefa confirmada.');
            closeConfirmForm();
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

    async function handleMove(
        occurrence: Occurrence,
        action: 'start' | 'pause' | 'resume',
        successMessage: string,
    ) {
        try {
            setActingId(occurrence.id);
            await api.post(`/tasks/occurrences/${occurrence.id}/${action}`);
            toast.success(successMessage);
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao mover tarefa.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setActingId(null);
        }
    }

    function renderCard(occurrence: Occurrence) {
        const canActOnThis =
            occurrence.status !== 'DONE' &&
            (canManage || occurrence.task.assignedTo.id === currentUserId);
        const acting = actingId === occurrence.id;

        return (
            <div
                key={occurrence.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
            >
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug">
                        {occurrence.task.title}
                    </h3>
                    <StatusBadge status={occurrence.status} />
                </div>

                {occurrence.task.description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {occurrence.task.description}
                    </p>
                )}

                {occurrence.task.attachmentUrl && (
                    <a
                        href={`${API_URL}${occurrence.task.attachmentUrl}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex w-fit items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500 hover:underline"
                    >
                        <Paperclip size={12} />
                        {occurrence.task.attachmentName || 'Anexo da tarefa'}
                    </a>
                )}

                <div className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
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

                {(occurrence.notes || occurrence.attachmentUrl) && (
                    <div className="space-y-1 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-3 text-sm">
                        {occurrence.notes && (
                            <p className="text-zinc-700 dark:text-zinc-300">
                                {occurrence.notes}
                            </p>
                        )}
                        {occurrence.attachmentUrl && (
                            <a
                                href={`${API_URL}${occurrence.attachmentUrl}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-500 hover:underline"
                            >
                                <Paperclip size={12} />
                                {occurrence.attachmentName || 'Anexo'}
                            </a>
                        )}
                    </div>
                )}

                {confirmFormId === occurrence.id ? (
                    <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                        <textarea
                            value={confirmNotes}
                            onChange={(e) => setConfirmNotes(e.target.value)}
                            placeholder="Observação (opcional)"
                            rows={2}
                            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                        />
                        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
                            {confirmFile ? (
                                <p className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                                    <Paperclip size={12} />
                                    {confirmFile.name}
                                    <button
                                        type="button"
                                        onClick={() => setConfirmFile(null)}
                                        className="ml-1 text-zinc-400 hover:text-red-500"
                                    >
                                        <X size={12} />
                                    </button>
                                </p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            document
                                                .getElementById(`confirm-camera-${occurrence.id}`)
                                                ?.click()
                                        }
                                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                    >
                                        <Camera size={14} />
                                        Tirar foto
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            document
                                                .getElementById(`confirm-file-${occurrence.id}`)
                                                ?.click()
                                        }
                                        className="flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                        <Paperclip size={14} />
                                        Escolher arquivo
                                    </button>
                                </div>
                            )}
                        </div>
                        <input
                            id={`confirm-camera-${occurrence.id}`}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) =>
                                setConfirmFile(e.target.files?.[0] || null)
                            }
                            className="hidden"
                        />
                        <input
                            id={`confirm-file-${occurrence.id}`}
                            type="file"
                            onChange={(e) =>
                                setConfirmFile(e.target.files?.[0] || null)
                            }
                            className="hidden"
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleConfirm(occurrence)}
                                disabled={acting}
                                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {acting ? 'Confirmando...' : 'Confirmar'}
                            </button>
                            <button
                                onClick={closeConfirmForm}
                                disabled={acting}
                                className="rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    canActOnThis && (
                        <div className="mt-auto flex flex-wrap gap-2 pt-2">
                            {(occurrence.status === 'PENDING' ||
                                occurrence.status === 'LATE') && (
                                    <button
                                        onClick={() =>
                                            handleMove(occurrence, 'start', 'Tarefa iniciada.')
                                        }
                                        disabled={acting}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        <PlayCircle size={16} />
                                        Iniciar
                                    </button>
                                )}

                            {occurrence.status === 'IN_PROGRESS' && (
                                <button
                                    onClick={() =>
                                        handleMove(occurrence, 'pause', 'Tarefa pausada.')
                                    }
                                    disabled={acting}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    <PauseCircle size={16} />
                                    Pausar
                                </button>
                            )}

                            {occurrence.status === 'PAUSED' && (
                                <button
                                    onClick={() =>
                                        handleMove(occurrence, 'resume', 'Tarefa retomada.')
                                    }
                                    disabled={acting}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                    <PauseCircle size={16} />
                                    Pausada
                                </button>
                            )}

                            <button
                                onClick={() => openConfirmForm(occurrence.id)}
                                disabled={acting}
                                title="Concluir"
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <CheckCircle2 size={16} />
                            </button>
                        </div>
                    )
                )}

                {occurrence.status === 'DONE' && canManage && (
                    <button
                        onClick={() => handleUndo(occurrence)}
                        disabled={acting}
                        title="Desfazer confirmação"
                        className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                        <RotateCcw size={16} />
                        Desfazer
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : occurrences.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma tarefa por aqui.
                </p>
            ) : (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
                        {BOARD_COLUMNS.map((column) => {
                            const count = occurrences.filter((occurrence) =>
                                column.statuses.includes(occurrence.status),
                            ).length;
                            const active = activeColumn === column.key;

                            return (
                                <button
                                    key={column.key}
                                    onClick={() => setActiveColumn(column.key)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${active
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                                        }`}
                                >
                                    {column.label}
                                    <span
                                        className={`rounded-full px-1.5 text-xs ${active
                                            ? 'bg-white/20'
                                            : 'bg-zinc-200 dark:bg-zinc-800'
                                            }`}
                                    >
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-4 md:flex-row md:gap-4 md:overflow-x-auto md:pb-2">
                        {BOARD_COLUMNS.map((column) => {
                            const columnItems = occurrences.filter((occurrence) =>
                                column.statuses.includes(occurrence.status),
                            );

                            return (
                                <div
                                    key={column.key}
                                    className={`${activeColumn === column.key ? 'flex' : 'hidden'
                                        } w-full flex-col gap-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900/50 p-3 md:flex md:w-[280px] md:shrink-0`}
                                >
                                    <div className="hidden items-center justify-between px-1 md:flex">
                                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                                            {column.label}
                                        </h3>
                                        <span className="rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                                            {columnItems.length}
                                        </span>
                                    </div>

                                    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                                        {columnItems.length === 0 ? (
                                            <p className="px-1 text-xs text-zinc-500">
                                                Nada por aqui.
                                            </p>
                                        ) : (
                                            columnItems.map((occurrence) => renderCard(occurrence))
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

const EMPTY_FORM = {
    title: '',
    description: '',
    storeId: '',
    assignedToId: '',
    recurrence: 'DAILY' as Recurrence,
    weekday: '2',
    dayOfMonth: '1',
    dueDate: '',
    restrictedFromAdministrativo: false,
    restrictedFromGerente: false,
};

function GerenciarTab() {
    const [tasks, setTasks] = useState<TaskDef[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

    const activeStore = getActiveStore();
    const currentUser = getUser();
    // Só Proprietário pode restringir uma tarefa do Administrativo; só
    // Proprietário ou Administrativo podem restringir do Gerente. Gerente
    // não tem autoridade pra restringir ninguém.
    const canRestrictFromAdministrativo = currentUser?.role === 'PROPRIETARIO';
    const canRestrictFromGerente =
        currentUser?.role === 'PROPRIETARIO' || currentUser?.role === 'ADMINISTRATIVO';

    const storeUsers = useMemo(
        () =>
            users.filter(
                (u) =>
                    u.active &&
                    form.storeId &&
                    u.userStores.some((item) => item.store.id === form.storeId),
            ),
        [users, form.storeId],
    );

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const [tasksRes, usersRes, storesRes] = await Promise.all([
                api.get('/tasks', { params: { storeId: store.id, active: true } }),
                api.get('/users'),
                api.get('/stores'),
            ]);

            setTasks(tasksRes.data);
            setUsers(usersRes.data);
            setStores(storesRes.data);
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
        setForm({ ...EMPTY_FORM, storeId: activeStore?.id || '' });
        setEditingId(null);
        setShowForm(false);
        setAttachmentFile(null);
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
            storeId: task.store.id,
            assignedToId: task.assignedTo.id,
            recurrence: task.recurrence,
            weekday: task.weekday !== null ? String(task.weekday) : '2',
            dayOfMonth: task.dayOfMonth !== null ? String(task.dayOfMonth) : '1',
            dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
            restrictedFromAdministrativo: task.restrictedFromAdministrativo,
            restrictedFromGerente: task.restrictedFromGerente,
        });
        setAttachmentFile(null);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!form.storeId) {
            toast.error('Escolha a loja da tarefa.');
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
            storeId: form.storeId,
            assignedToId: form.assignedToId,
            recurrence: form.recurrence,
            restrictedFromAdministrativo: form.restrictedFromAdministrativo,
            restrictedFromGerente: form.restrictedFromGerente,
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
                const formData = new FormData();

                Object.entries(payload).forEach(([key, value]) => {
                    if (value !== undefined) formData.append(key, String(value));
                });

                if (attachmentFile) formData.append('attachment', attachmentFile);

                await api.post('/tasks', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
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
                        Lista da loja ativa no topo — ao criar, escolha a loja da tarefa
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
                            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
                                Loja
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                                {stores.map((store) => (
                                    <button
                                        key={store.id}
                                        type="button"
                                        onClick={() =>
                                            setForm({
                                                ...form,
                                                storeId: store.id,
                                                assignedToId: '',
                                            })
                                        }
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${form.storeId === store.id
                                            ? 'bg-emerald-600 text-white'
                                            : 'border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                            }`}
                                    >
                                        {store.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {(canRestrictFromAdministrativo || canRestrictFromGerente) && (
                            <div className="sm:col-span-2">
                                <label className="mb-1.5 flex items-center gap-1 text-xs font-medium text-zinc-500">
                                    <EyeOff size={12} />
                                    Restringir visibilidade (opcional)
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {canRestrictFromAdministrativo && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setForm({
                                                    ...form,
                                                    restrictedFromAdministrativo:
                                                        !form.restrictedFromAdministrativo,
                                                })
                                            }
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${form.restrictedFromAdministrativo
                                                ? 'bg-red-600 text-white'
                                                : 'border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                }`}
                                        >
                                            Ocultar do Administrativo
                                        </button>
                                    )}

                                    {canRestrictFromGerente && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setForm({
                                                    ...form,
                                                    restrictedFromGerente:
                                                        !form.restrictedFromGerente,
                                                })
                                            }
                                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${form.restrictedFromGerente
                                                ? 'bg-red-600 text-white'
                                                : 'border border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                                }`}
                                        >
                                            Ocultar do Gerente
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

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

                    {!editingId && (
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Anexo (opcional) — ex: um formulário pra preencher
                            </label>

                            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
                                {attachmentFile ? (
                                    <p className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
                                        <Paperclip size={12} />
                                        {attachmentFile.name}
                                        <button
                                            type="button"
                                            onClick={() => setAttachmentFile(null)}
                                            className="ml-1 text-zinc-400 hover:text-red-500"
                                        >
                                            <X size={12} />
                                        </button>
                                    </p>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                document
                                                    .getElementById('task-attachment-camera')
                                                    ?.click()
                                            }
                                            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                                        >
                                            <Camera size={14} />
                                            Tirar foto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                document
                                                    .getElementById('task-attachment-file')
                                                    ?.click()
                                            }
                                            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        >
                                            <Paperclip size={14} />
                                            Escolher arquivo
                                        </button>
                                    </div>
                                )}
                            </div>

                            <input
                                id="task-attachment-camera"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) =>
                                    setAttachmentFile(e.target.files?.[0] || null)
                                }
                                className="hidden"
                            />
                            <input
                                id="task-attachment-file"
                                type="file"
                                onChange={(e) =>
                                    setAttachmentFile(e.target.files?.[0] || null)
                                }
                                className="hidden"
                            />
                        </div>
                    )}

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
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold">{task.title}</p>
                                    {(task.restrictedFromAdministrativo ||
                                        task.restrictedFromGerente) && (
                                            <span
                                                title={[
                                                    task.restrictedFromAdministrativo &&
                                                    'oculta do Administrativo',
                                                    task.restrictedFromGerente &&
                                                    'oculta do Gerente',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' e ')}
                                                className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500"
                                            >
                                                <EyeOff size={11} />
                                                Restrita
                                            </span>
                                        )}
                                </div>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {task.assignedTo.name} —{' '}
                                    {RECURRENCE_LABELS[task.recurrence]} (
                                    {recurrenceDetail(task)})
                                </p>
                                {task.attachmentUrl && (
                                    <a
                                        href={`${API_URL}${task.attachmentUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-500 hover:underline"
                                    >
                                        <Paperclip size={12} />
                                        {task.attachmentName || 'Anexo'}
                                    </a>
                                )}
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
