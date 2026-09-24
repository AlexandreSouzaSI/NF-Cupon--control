'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { CalendarDays, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

type SupplierCategory = {
    id: string;
    name: string;
};

type ScheduleEntry = {
    id: string;
    diaSemana: number;
    category: SupplierCategory;
};

// Mesma ordem/label do backend (DIAS_SEMANA em quotations.service.ts) —
// index = Date.getDay(): 0 domingo ... 6 sábado.
const DIAS_SEMANA = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
];

export function ScheduleTab() {
    const [categories, setCategories] = useState<SupplierCategory[]>([]);
    const [entries, setEntries] = useState<ScheduleEntry[]>([]);
    const [loading, setLoading] = useState(true);

    // categoryId escolhido em cada select de "adicionar" por dia —
    // guardado por índice de dia (0-6) separadamente.
    const [selecting, setSelecting] = useState<Record<number, string>>({});
    const [saving, setSaving] = useState<number | null>(null);

    const store = getActiveStore();

    async function load() {
        if (!store) return;

        try {
            setLoading(true);

            const [scheduleRes, categoriesRes] = await Promise.all([
                api.get('/quotations/schedule', { params: { storeId: store.id } }),
                api.get('/suppliers/categories'),
            ]);

            setEntries(scheduleRes.data || []);
            setCategories(categoriesRes.data || []);
        } catch {
            toast.error('Erro ao carregar a agenda de cotação');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleAdd(diaSemana: number) {
        const categoryId = selecting[diaSemana];

        if (!categoryId || !store) {
            toast.error('Escolha uma categoria');
            return;
        }

        try {
            setSaving(diaSemana);

            await api.post('/quotations/schedule', {
                storeId: store.id,
                diaSemana,
                categoryId,
            });

            setSelecting((current) => ({ ...current, [diaSemana]: '' }));
            await load();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao adicionar categoria na agenda',
            );
        } finally {
            setSaving(null);
        }
    }

    async function handleRemove(id: string) {
        try {
            await api.delete(`/quotations/schedule/${id}`);
            await load();
        } catch {
            toast.error('Erro ao remover da agenda');
        }
    }

    if (!store) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Selecione uma loja ativa no topo do sistema.
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-indigo-500/10 p-3 text-indigo-500">
                    <CalendarDays size={20} />
                </div>

                <div>
                    <h2 className="text-lg font-bold">Agenda fixa de cotação</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Em qual dia da semana cada categoria costuma ser
                        cotada — é só uma sugestão padrão, dá pra gerar
                        cotação de qualquer categoria em qualquer dia
                        também.
                    </p>
                </div>
            </div>

            {loading ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando...</p>
            ) : categories.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma categoria cadastrada ainda — crie categorias em
                    Cadastros → Fornecedores primeiro.
                </p>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {DIAS_SEMANA.map((label, diaSemana) => {
                        const diaEntries = entries.filter(
                            (entry) => entry.diaSemana === diaSemana,
                        );

                        const usedIds = new Set(
                            diaEntries.map((entry) => entry.category.id),
                        );
                        const available = categories.filter(
                            (category) => !usedIds.has(category.id),
                        );

                        return (
                            <div
                                key={diaSemana}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
                            >
                                <p className="mb-3 text-sm font-bold">{label}</p>

                                <div className="mb-3 flex flex-wrap gap-2">
                                    {diaEntries.length === 0 ? (
                                        <p className="text-xs text-zinc-500">
                                            Nenhuma categoria nesse dia.
                                        </p>
                                    ) : (
                                        diaEntries.map((entry) => (
                                            <span
                                                key={entry.id}
                                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 py-1 pl-3 pr-1 text-xs text-zinc-700 dark:text-zinc-300"
                                            >
                                                {entry.category.name}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleRemove(entry.id)
                                                    }
                                                    className="rounded-full p-0.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                    title="Remover"
                                                >
                                                    <X size={11} />
                                                </button>
                                            </span>
                                        ))
                                    )}
                                </div>

                                {available.length > 0 && (
                                    <div className="flex gap-1.5">
                                        <select
                                            value={selecting[diaSemana] || ''}
                                            onChange={(e) =>
                                                setSelecting((current) => ({
                                                    ...current,
                                                    [diaSemana]: e.target.value,
                                                }))
                                            }
                                            className="h-9 flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 text-xs outline-none focus:border-indigo-500"
                                        >
                                            <option value="">Adicionar...</option>
                                            {available.map((category) => (
                                                <option
                                                    key={category.id}
                                                    value={category.id}
                                                >
                                                    {category.name}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            type="button"
                                            disabled={saving === diaSemana}
                                            onClick={() => handleAdd(diaSemana)}
                                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
                                        >
                                            <Plus size={14} />
                                        </button>
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
