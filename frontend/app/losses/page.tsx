'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Camera,
    CheckCircle2,
    FileDown,
    FileText,
    ImageOff,
    Loader2,
    PackageX,
    Plus,
    Printer,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { NfViewerModal } from '../../src/components/ui/NfViewerModal';

function photoSrc(photoUrl: string) {
    return `${API_URL}${photoUrl}`;
}

function fileSrc(fileUrl: string) {
    return `${API_URL}${fileUrl}`;
}

type Loss = {
    id: string;
    description: string;
    quantity: string;
    unit: string | null;
    reason: string | null;
    unitValue?: string | null;
    photoUrl: string;
    occurredAt: string;
    store: { id: string; name: string };
    reportedBy: { id: string; name: string };
};

type MonthlyReport = {
    losses: Loss[];
    totals: { description: string; unit: string | null; quantity: number }[];
};

type LossNfeStatus = 'RASCUNHO' | 'ENVIADA' | 'AUTORIZADA' | 'REJEITADA' | 'CANCELADA';

type LossNfe = {
    id: string;
    status: LossNfeStatus;
    ambiente: number;
    serie: number | null;
    numero: number | null;
    chaveAcesso: string | null;
    issueDate: string | null;
    justificativa: string;
    xmlFileUrl: string | null;
    createdAt: string;
    createdBy: { id: string; name: string };
    losses: {
        id: string;
        description: string;
        quantity: string;
        unit: string | null;
        unitValue: string | null;
    }[];
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusLabel(status: LossNfeStatus) {
    const labels: Record<LossNfeStatus, string> = {
        RASCUNHO: 'Rascunho (assinada, ainda não enviada)',
        ENVIADA: 'Enviada — aguardando retorno',
        AUTORIZADA: 'Autorizada',
        REJEITADA: 'Rejeitada',
        CANCELADA: 'Cancelada',
    };

    return labels[status] || status;
}

function statusColor(status: LossNfeStatus) {
    switch (status) {
        case 'AUTORIZADA':
            return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
        case 'REJEITADA':
        case 'CANCELADA':
            return 'border-red-500/30 bg-red-500/10 text-red-400';
        case 'ENVIADA':
            return 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500';
        default:
            return 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400';
    }
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatQuantity(value: number | string, unit: string | null) {
    const n = Number(value);
    const formatted = n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

    return unit ? `${formatted} ${unit}` : formatted;
}

type TabKey = 'registrar' | 'relatorio' | 'nfe';

type LossItemForm = {
    description: string;
    quantity: string;
    unit: string;
    unitValue: string;
    ncm: string;
};

function emptyLossItem(): LossItemForm {
    return { description: '', quantity: '', unit: '', unitValue: '', ncm: '' };
}

export default function LossesPage() {
    const [tab, setTab] = useState<TabKey>('registrar');

    return (
        <AppLayout title="Perdas">
            <div className="space-y-5">
                <div className="print:hidden">
                    <h2 className="text-2xl font-bold">Perdas</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Registre com foto o que foi perdido na loja ativa —
                        vira o relatório do mês pra montar a NF de perda.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2 print:hidden">
                    <button
                        onClick={() => setTab('registrar')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'registrar'
                            ? 'bg-emerald-600 text-white'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        <Camera size={16} />
                        Registrar
                    </button>
                    <button
                        onClick={() => setTab('relatorio')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'relatorio'
                            ? 'bg-emerald-600 text-white'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        <FileDown size={16} />
                        Relatório mensal
                    </button>
                    <button
                        onClick={() => setTab('nfe')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${tab === 'nfe'
                            ? 'bg-emerald-600 text-white'
                            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            }`}
                    >
                        <FileText size={16} />
                        NF de Perda
                    </button>
                </div>

                {tab === 'registrar' ? (
                    <RegistrarTab />
                ) : tab === 'relatorio' ? (
                    <RelatorioTab />
                ) : (
                    <NfPerdaTab />
                )}
            </div>
        </AppLayout>
    );
}

function RegistrarTab() {
    const [losses, setLosses] = useState<Loss[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const [items, setItems] = useState<LossItemForm[]>([emptyLossItem()]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    function updateItem(index: number, field: keyof LossItemForm, value: string) {
        setItems((prev) =>
            prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
        );
    }

    function addItem() {
        setItems((prev) => [...prev, emptyLossItem()]);
    }

    function removeItem(index: number) {
        setItems((prev) =>
            prev.length === 1 ? prev : prev.filter((_, i) => i !== index),
        );
    }

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const now = new Date();
            const response = await api.get('/losses', {
                params: {
                    storeId: store.id,
                    month: now.getMonth() + 1,
                    year: now.getFullYear(),
                },
            });

            setLosses(response.data);
        } catch {
            toast.error('Erro ao carregar perdas.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] || null;
        setPhotoFile(file);

        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(file ? URL.createObjectURL(file) : null);
    }

    function resetForm() {
        setItems([emptyLossItem()]);
        setReason('');
        setPhotoFile(null);
        if (photoPreview) URL.revokeObjectURL(photoPreview);
        setPhotoPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!photoFile) {
            toast.error('Tire ou escolha uma foto do que foi perdido.');
            return;
        }

        const filledItems = items.filter((item) => item.description.trim());

        if (filledItems.length === 0) {
            toast.error('Adicione pelo menos um item (descrição do produto).');
            return;
        }

        for (const item of filledItems) {
            if (!item.quantity || Number(item.quantity) <= 0) {
                toast.error(`Informe a quantidade de "${item.description}".`);
                return;
            }
        }

        const formData = new FormData();
        formData.append('storeId', store.id);
        formData.append(
            'items',
            JSON.stringify(
                filledItems.map((item) => ({
                    description: item.description.trim(),
                    quantity: Number(item.quantity),
                    unit: item.unit.trim() || undefined,
                    reason: reason.trim() || undefined,
                    unitValue: item.unitValue.trim()
                        ? Number(item.unitValue)
                        : undefined,
                    ncm: item.ncm.trim() || undefined,
                })),
            ),
        );
        formData.append('photo', photoFile);

        try {
            setSaving(true);

            await api.post('/losses/batch', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            toast.success(
                filledItems.length > 1
                    ? `${filledItems.length} perdas registradas.`
                    : 'Perda registrada.',
            );
            resetForm();
            await load();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao registrar perda.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(loss: Loss) {
        const confirmed = confirm(`Apagar o registro de "${loss.description}"?`);

        if (!confirmed) return;

        try {
            await api.delete(`/losses/${loss.id}`);
            toast.success('Registro apagado.');
            await load();
        } catch {
            toast.error('Erro ao apagar registro.');
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
            <form
                onSubmit={handleSubmit}
                className="space-y-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
                <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-red-500/10 p-3 text-red-400">
                        <PackageX size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Registrar perda</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Foto do que foi perdido
                    </label>

                    {photoPreview ? (
                        <div className="relative overflow-hidden rounded-2xl border border-zinc-300 dark:border-zinc-700">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={photoPreview}
                                alt="Prévia da foto"
                                className="h-48 w-full object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white hover:bg-black/80"
                            >
                                Trocar foto
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:border-emerald-500 hover:text-emerald-500"
                        >
                            <Camera size={28} />
                            <span className="text-sm font-medium">
                                Tirar ou escolher foto
                            </span>
                        </button>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoChange}
                        className="hidden"
                    />
                </div>

                <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Motivo (opcional)
                    </label>
                    <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Quebra, vencimento, extravio... (vale pra todos os itens dessa foto)"
                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                    />
                </div>

                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <label className="block text-sm text-zinc-700 dark:text-zinc-300">
                            Itens perdidos
                        </label>
                        <span className="text-xs text-zinc-500">
                            {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {items.map((item, index) => (
                            <div
                                key={index}
                                className="space-y-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-semibold text-emerald-500">
                                        {index + 1}
                                    </span>
                                    <input
                                        value={item.description}
                                        onChange={(e) =>
                                            updateItem(index, 'description', e.target.value)
                                        }
                                        placeholder="Ex: Heineken long neck"
                                        className="h-11 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    {items.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeItem(index)}
                                            title="Remover item"
                                            className="shrink-0 rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={item.quantity}
                                        onChange={(e) =>
                                            updateItem(index, 'quantity', e.target.value)
                                        }
                                        placeholder="Qtd."
                                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <input
                                        value={item.unit}
                                        onChange={(e) =>
                                            updateItem(index, 'unit', e.target.value)
                                        }
                                        placeholder="Un. (Lt, kg)"
                                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={item.unitValue}
                                        onChange={(e) =>
                                            updateItem(index, 'unitValue', e.target.value)
                                        }
                                        placeholder="Valor R$"
                                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                </div>

                                <input
                                    value={item.ncm}
                                    onChange={(e) => updateItem(index, 'ncm', e.target.value)}
                                    placeholder="NCM (opcional)"
                                    className="h-9 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs outline-none focus:border-emerald-500"
                                />
                            </div>
                        ))}
                    </div>

                    <button
                        type="button"
                        onClick={addItem}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:border-emerald-500 hover:text-emerald-500"
                    >
                        <Plus size={16} />
                        Adicionar item
                    </button>

                    <p className="text-xs text-zinc-500">
                        Preenchendo o valor (R$) de um item, ele fica
                        disponível na aba &quot;NF de Perda&quot; pra entrar
                        numa nota fiscal de baixa de estoque. NCM é
                        opcional — sem ele, a nota sai com um código
                        genérico.
                    </p>
                </div>

                <button
                    disabled={saving}
                    className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                    {saving
                        ? 'Registrando...'
                        : items.filter((i) => i.description.trim()).length > 1
                            ? `Registrar ${items.filter((i) => i.description.trim()).length} perdas`
                            : 'Registrar perda'}
                </button>
            </form>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-5 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold">Perdas do mês</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Loja ativa no topo do sistema
                        </p>
                    </div>
                </div>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <Loader2 size={14} className="animate-spin" />
                        Carregando...
                    </p>
                ) : losses.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma perda registrada esse mês nessa loja.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {losses.map((loss) => (
                            <div
                                key={loss.id}
                                className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950"
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={photoSrc(loss.photoUrl)}
                                    alt={loss.description}
                                    className="h-32 w-full object-cover"
                                />
                                <div className="space-y-1 p-3">
                                    <p className="font-semibold leading-snug">
                                        {loss.description}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {formatQuantity(loss.quantity, loss.unit)}
                                        {loss.reason ? ` — ${loss.reason}` : ''}
                                    </p>
                                    <p className="text-xs text-zinc-500">
                                        {formatDateTime(loss.occurredAt)} —{' '}
                                        {loss.reportedBy.name}
                                    </p>
                                    {loss.unitValue && (
                                        <p className="text-xs text-emerald-500">
                                            {formatCurrency(Number(loss.unitValue))} /
                                            un. — pronta pra NF de perda
                                        </p>
                                    )}

                                    <button
                                        onClick={() => handleRemove(loss)}
                                        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
                                    >
                                        <Trash2 size={12} />
                                        Apagar
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

function currentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function RelatorioTab() {
    const [monthValue, setMonthValue] = useState(currentMonthValue());
    const [report, setReport] = useState<MonthlyReport | null>(null);
    const [loading, setLoading] = useState(true);

    const [year, month] = useMemo(
        () => monthValue.split('-').map(Number),
        [monthValue],
    );

    async function load() {
        const store = getActiveStore();

        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);

            const response = await api.get('/losses/monthly-report', {
                params: { storeId: store.id, month, year },
            });

            setReport(response.data);
        } catch {
            toast.error('Erro ao carregar relatório.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthValue]);

    const store = getActiveStore();
    const totalQuantity =
        report?.totals.reduce((sum, t) => sum + t.quantity, 0) || 0;

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Mês
                    </label>
                    <input
                        type="month"
                        value={monthValue}
                        onChange={(e) => setMonthValue(e.target.value)}
                        className="h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                    />
                </div>

                <button
                    onClick={() => window.print()}
                    disabled={!report || report.losses.length === 0}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                    <Printer size={16} />
                    Imprimir / Salvar PDF
                </button>
            </div>

            <div className="hidden print:block">
                <h1 className="text-xl font-bold">
                    Relatório de perdas — {store?.name || ''}
                </h1>
                <p className="text-sm text-zinc-600">
                    {String(month).padStart(2, '0')}/{year}
                </p>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Carregando...
                </p>
            ) : !report || report.losses.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <ImageOff size={16} />
                    Nenhuma perda registrada nesse mês.
                </p>
            ) : (
                <>
                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <h3 className="mb-4 text-lg font-bold">
                            Totais por produto — pra montar a NF de perda
                        </h3>

                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500">
                                    <th className="pb-2 font-medium">Produto</th>
                                    <th className="pb-2 text-right font-medium">
                                        Quantidade perdida
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.totals.map((total) => (
                                    <tr
                                        key={total.description}
                                        className="border-b border-zinc-100 dark:border-zinc-800/60"
                                    >
                                        <td className="py-2">{total.description}</td>
                                        <td className="py-2 text-right font-semibold">
                                            {formatQuantity(total.quantity, total.unit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                            {report.losses.length} registro(s) — {totalQuantity.toLocaleString('pt-BR')}{' '}
                            unidades perdidas no total (somando produtos com
                            unidades diferentes à parte).
                        </p>
                    </div>

                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                        <h3 className="mb-4 text-lg font-bold print:hidden">
                            Registros com foto
                        </h3>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
                            {report.losses.map((loss) => (
                                <div
                                    key={loss.id}
                                    className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 break-inside-avoid"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={photoSrc(loss.photoUrl)}
                                        alt={loss.description}
                                        className="h-40 w-full object-cover"
                                    />
                                    <div className="p-3">
                                        <p className="font-semibold leading-snug">
                                            {loss.description}
                                        </p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            {formatQuantity(loss.quantity, loss.unit)}
                                            {loss.reason ? ` — ${loss.reason}` : ''}
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            {formatDateTime(loss.occurredAt)} —{' '}
                                            {loss.reportedBy.name}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

function NfPerdaTab() {
    const [eligible, setEligible] = useState<Loss[]>([]);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [justificativa, setJustificativa] = useState('');
    const [loading, setLoading] = useState(true);
    const [emitting, setEmitting] = useState(false);
    const [nfes, setNfes] = useState<LossNfe[]>([]);
    const [loadingNfes, setLoadingNfes] = useState(true);
    const [viewingNfeId, setViewingNfeId] = useState<string | null>(null);

    const store = getActiveStore();

    async function loadEligible() {
        if (!store) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const response = await api.get('/losses/nfe/eligible', {
                params: { storeId: store.id },
            });
            setEligible(response.data);
        } catch {
            toast.error('Erro ao carregar perdas com valor definido.');
        } finally {
            setLoading(false);
        }
    }

    async function loadNfes() {
        if (!store) {
            setLoadingNfes(false);
            return;
        }

        try {
            setLoadingNfes(true);
            const response = await api.get('/losses/nfe', {
                params: { storeId: store.id },
            });
            setNfes(response.data);
        } catch {
            toast.error('Erro ao carregar NFs de perda já geradas.');
        } finally {
            setLoadingNfes(false);
        }
    }

    useEffect(() => {
        loadEligible();
        loadNfes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function toggleSelected(id: string) {
        setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    }

    const selectedIds = Object.keys(selected).filter((id) => selected[id]);
    const selectedLosses = eligible.filter((loss) => selected[loss.id]);
    const selectedTotal = selectedLosses.reduce(
        (sum, loss) => sum + Number(loss.quantity) * Number(loss.unitValue || 0),
        0,
    );

    async function handleEmit() {
        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (selectedIds.length === 0) {
            toast.error('Selecione ao menos uma perda.');
            return;
        }

        if (!justificativa.trim()) {
            toast.error('Descreva o motivo da baixa (justificativa).');
            return;
        }

        const confirmed = confirm(
            `Gerar NF de perda em ambiente de homologação (teste, sem valor fiscal) com ${selectedIds.length} item(ns), totalizando ${formatCurrency(selectedTotal)}?`,
        );

        if (!confirmed) return;

        try {
            setEmitting(true);

            await api.post('/losses/nfe', {
                storeId: store.id,
                lossIds: selectedIds,
                justificativa: justificativa.trim(),
            });

            toast.success('NF de perda gerada e assinada (homologação).');
            setSelected({});
            setJustificativa('');
            await loadEligible();
            await loadNfes();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao gerar a NF de perda.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setEmitting(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-700 dark:text-yellow-400">
                Essa NF de perda ainda é gerada só em ambiente de{' '}
                <strong>homologação</strong> (teste, sem valor fiscal) — ainda
                não é enviada pra Sefaz nem substitui nenhum controle contábil
                atual. Confirme com o contador antes de usar isso pra valer.
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-4">
                        <h2 className="text-lg font-bold">Perdas prontas pra NF</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Só aparecem aqui perdas com valor unitário
                            preenchido e que ainda não entraram em nenhuma NF.
                        </p>
                    </div>

                    {loading ? (
                        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                            <Loader2 size={14} className="animate-spin" />
                            Carregando...
                        </p>
                    ) : eligible.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhuma perda disponível. Preencha o valor
                            unitário na aba &quot;Registrar&quot; pra uma
                            perda aparecer aqui.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {eligible.map((loss) => {
                                const lineTotal =
                                    Number(loss.quantity) * Number(loss.unitValue || 0);

                                return (
                                    <label
                                        key={loss.id}
                                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${selected[loss.id]
                                            ? 'border-emerald-500 bg-emerald-500/5'
                                            : 'border-zinc-200 dark:border-zinc-800'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!!selected[loss.id]}
                                            onChange={() => toggleSelected(loss.id)}
                                            className="h-4 w-4"
                                        />

                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium leading-snug">
                                                {loss.description}
                                            </p>
                                            <p className="text-xs text-zinc-500">
                                                {formatQuantity(loss.quantity, loss.unit)} ×{' '}
                                                {formatCurrency(Number(loss.unitValue || 0))} —{' '}
                                                {formatDateTime(loss.occurredAt)}
                                            </p>
                                        </div>

                                        <p className="shrink-0 font-semibold">
                                            {formatCurrency(lineTotal)}
                                        </p>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="h-fit rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <h2 className="mb-4 text-lg font-bold">Gerar NF de perda</h2>

                    <div className="space-y-4">
                        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-950 p-3 text-sm">
                            <p className="text-zinc-600 dark:text-zinc-400">
                                {selectedIds.length} item(ns) selecionado(s)
                            </p>
                            <p className="text-lg font-bold">
                                {formatCurrency(selectedTotal)}
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Justificativa (motivo da baixa)
                            </label>
                            <textarea
                                value={justificativa}
                                onChange={(e) => setJustificativa(e.target.value)}
                                placeholder="Ex: Quebra de garrafas no estoque, produtos vencidos descartados em 05/09..."
                                rows={4}
                                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm outline-none focus:border-emerald-500"
                            />
                            <p className="mt-1 text-xs text-zinc-500">
                                Vai pro texto oficial da nota (infAdFisco). Se
                                for roubo/furto, inclua o número do B.O.
                            </p>
                        </div>

                        <button
                            onClick={handleEmit}
                            disabled={emitting || selectedIds.length === 0}
                            className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {emitting ? 'Gerando...' : 'Gerar NF de perda (teste)'}
                        </button>
                    </div>
                </section>
            </div>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <h2 className="mb-4 text-lg font-bold">NFs de perda geradas</h2>

                {loadingNfes ? (
                    <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                        <Loader2 size={14} className="animate-spin" />
                        Carregando...
                    </p>
                ) : nfes.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma NF de perda gerada ainda.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {nfes.map((nfe) => {
                            const total = nfe.losses.reduce(
                                (sum, loss) =>
                                    sum + Number(loss.quantity) * Number(loss.unitValue || 0),
                                0,
                            );

                            return (
                                <div
                                    key={nfe.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium ${statusColor(nfe.status)}`}
                                                >
                                                    <CheckCircle2 size={12} />
                                                    {statusLabel(nfe.status)}
                                                </span>
                                                <span className="text-xs text-zinc-500">
                                                    Série {nfe.serie} · Número {nfe.numero} ·{' '}
                                                    {nfe.ambiente === 1
                                                        ? 'Produção'
                                                        : 'Homologação'}
                                                </span>
                                            </div>

                                            <p className="mt-1 text-sm font-mono text-zinc-600 dark:text-zinc-400 break-all">
                                                {nfe.chaveAcesso}
                                            </p>

                                            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                                                {nfe.justificativa}
                                            </p>

                                            <p className="mt-1 text-xs text-zinc-500">
                                                {nfe.losses.length} item(ns) —{' '}
                                                {formatCurrency(total)} —{' '}
                                                {nfe.issueDate
                                                    ? formatDateTime(nfe.issueDate)
                                                    : ''}{' '}
                                                — {nfe.createdBy.name}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 gap-2">
                                            <button
                                                onClick={() => setViewingNfeId(nfe.id)}
                                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/20"
                                            >
                                                <CheckCircle2 size={14} />
                                                Visualizar
                                            </button>

                                            {nfe.xmlFileUrl && (
                                                <a
                                                    href={fileSrc(nfe.xmlFileUrl)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                >
                                                    <FileText size={14} />
                                                    Ver XML
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {viewingNfeId && (
                <NfViewerModal
                    title="NF de perda"
                    viewUrl={`/losses/nfe/${viewingNfeId}/view`}
                    onClose={() => setViewingNfeId(null)}
                />
            )}
        </div>
    );
}
