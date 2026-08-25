'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Camera,
    FileDown,
    ImageOff,
    Loader2,
    PackageX,
    Printer,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

function photoSrc(photoUrl: string) {
    return `${API_URL}${photoUrl}`;
}

type Loss = {
    id: string;
    description: string;
    quantity: string;
    unit: string | null;
    reason: string | null;
    photoUrl: string;
    occurredAt: string;
    store: { id: string; name: string };
    reportedBy: { id: string; name: string };
};

type MonthlyReport = {
    losses: Loss[];
    totals: { description: string; unit: string | null; quantity: number }[];
};

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

type TabKey = 'registrar' | 'relatorio';

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
                </div>

                {tab === 'registrar' ? <RegistrarTab /> : <RelatorioTab />}
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
    const [form, setForm] = useState({
        description: '',
        quantity: '',
        unit: '',
        reason: '',
    });
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        setForm({ description: '', quantity: '', unit: '', reason: '' });
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

        if (!form.description.trim()) {
            toast.error('Descreva o produto perdido.');
            return;
        }

        if (!form.quantity || Number(form.quantity) <= 0) {
            toast.error('Informe a quantidade perdida.');
            return;
        }

        const formData = new FormData();
        formData.append('storeId', store.id);
        formData.append('description', form.description);
        formData.append('quantity', form.quantity);
        if (form.unit.trim()) formData.append('unit', form.unit.trim());
        if (form.reason.trim()) formData.append('reason', form.reason.trim());
        formData.append('photo', photoFile);

        try {
            setSaving(true);

            await api.post('/losses', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            toast.success('Perda registrada.');
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
                        Produto perdido
                    </label>
                    <input
                        value={form.description}
                        onChange={(e) =>
                            setForm({ ...form, description: e.target.value })
                        }
                        placeholder="Ex: Garrafa de vodka quebrada"
                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Quantidade
                        </label>
                        <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={form.quantity}
                            onChange={(e) =>
                                setForm({ ...form, quantity: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Unidade (opcional)
                        </label>
                        <input
                            value={form.unit}
                            onChange={(e) => setForm({ ...form, unit: e.target.value })}
                            placeholder="un, kg, L..."
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                        Motivo (opcional)
                    </label>
                    <input
                        value={form.reason}
                        onChange={(e) => setForm({ ...form, reason: e.target.value })}
                        placeholder="Quebra, vencimento, extravio..."
                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-emerald-500"
                    />
                </div>

                <button
                    disabled={saving}
                    className="h-12 w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                    {saving ? 'Registrando...' : 'Registrar perda'}
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
