'use client';

import { useEffect, useState } from 'react';

import { toast } from 'sonner';

import { api } from '@/lib/api';

// Grupos de categoria da tela de Contas a Pagar (mesmos valores do
// backend: BillCategory.group). Categoria sem grupo cai em "Outras".
export type BillCategoryGroup =
    | 'FUNCIONARIOS'
    | 'REVENDA'
    | 'MATERIA_PRIMA'
    | 'ATIVO'
    | 'DESPESAS_FIXAS'
    | 'SERVICOS'
    | 'IMPOSTOS'
    | 'SOCIOS';

export type BillCategory = {
    id: string;
    name: string;
    group?: BillCategoryGroup | null;
};

export const BILL_CATEGORY_GROUPS: {
    key: BillCategoryGroup;
    label: string;
    // classes do card/chip de cada grupo
    chip: string;
    card: string;
    dot: string;
}[] = [
    {
        key: 'FUNCIONARIOS',
        label: 'Funcionários',
        chip: 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400',
        card: 'border-violet-500/30 bg-violet-500/[0.06]',
        dot: 'bg-violet-500',
    },
    {
        key: 'REVENDA',
        label: 'Revenda',
        chip: 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400',
        card: 'border-amber-500/30 bg-amber-500/[0.06]',
        dot: 'bg-amber-500',
    },
    {
        key: 'MATERIA_PRIMA',
        label: 'Matéria-prima',
        chip: 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
        card: 'border-emerald-500/30 bg-emerald-500/[0.06]',
        dot: 'bg-emerald-500',
    },
    {
        key: 'ATIVO',
        label: 'Ativo',
        chip: 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400',
        card: 'border-sky-500/30 bg-sky-500/[0.06]',
        dot: 'bg-sky-500',
    },
    {
        key: 'DESPESAS_FIXAS',
        label: 'Despesas fixas',
        chip: 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400',
        card: 'border-rose-500/30 bg-rose-500/[0.06]',
        dot: 'bg-rose-500',
    },
    {
        key: 'SERVICOS',
        label: 'Serviços',
        chip: 'border-lime-500 bg-lime-500/10 text-lime-700 dark:text-lime-400',
        card: 'border-lime-500/30 bg-lime-500/[0.06]',
        dot: 'bg-lime-500',
    },
    {
        key: 'IMPOSTOS',
        label: 'Impostos',
        chip: 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400',
        card: 'border-orange-500/30 bg-orange-500/[0.06]',
        dot: 'bg-orange-500',
    },
    {
        key: 'SOCIOS',
        label: 'Sócios',
        chip: 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400',
        card: 'border-purple-500/30 bg-purple-500/[0.06]',
        dot: 'bg-purple-500',
    },
];

export const OTHER_GROUP = {
    label: 'Outras',
    chip: 'border-zinc-400 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
    card: 'border-zinc-300 bg-zinc-500/[0.04] dark:border-zinc-700',
    dot: 'bg-zinc-400',
};

export function groupInfo(group?: string | null) {
    return BILL_CATEGORY_GROUPS.find((g) => g.key === group) ?? OTHER_GROUP;
}

// Carrega as categorias da empresa. Com seedDefaults (tela de Contas a
// Pagar), na primeira vez — nenhuma categoria com grupo ainda — pede pro
// backend criar as subcategorias padrão.
// Uma vez por carregamento do sistema: garante as subcategorias padrão
// (idempotente no backend — só cria as que faltam).
let jaSemeou = false;

async function fetchBillCategories(seedDefaults: boolean): Promise<BillCategory[]> {
    try {
        const response = await api.get('/bill-categories');
        const list: BillCategory[] = Array.isArray(response?.data) ? response.data : [];

        if (!seedDefaults || jaSemeou) return list;
        jaSemeou = true;

        try {
            const created = await api.post('/bill-categories/padrao', {});
            return Array.isArray(created?.data) ? created.data : list;
        } catch (error: unknown) {
            // Normalmente: backend sem a migração da coluna "group" ainda.
            const status = (error as { response?: { status?: number } })?.response?.status;
            toast.error(
                status === 400
                    ? 'Selecione uma loja no topo pra criar as categorias padrão.'
                    : 'Não consegui criar as categorias padrão — rode "npx prisma migrate dev" no backend e reinicie.',
            );
            return list;
        }
    } catch {
        return [];
    }
}

export function useBillCategories(options?: { seedDefaults?: boolean }) {
    const seedDefaults = Boolean(options?.seedDefaults);
    const [categories, setCategories] = useState<BillCategory[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        fetchBillCategories(seedDefaults).then((list) => {
            if (!alive) return;
            setCategories(list);
            setLoaded(true);
        });
        return () => {
            alive = false;
        };
    }, [seedDefaults]);

    async function reload() {
        setCategories(await fetchBillCategories(seedDefaults));
    }

    return { categories, loaded, reload };
}

// <select> com as categorias agrupadas (Funcionários, Revenda, ...).
export function BillCategorySelect({
    categories,
    value,
    onChange,
    placeholder = 'Sem categoria',
    className,
    disabled,
}: {
    categories: BillCategory[];
    value: string;
    onChange: (categoryId: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
}) {
    const others = categories.filter(
        (category) => !BILL_CATEGORY_GROUPS.some((g) => g.key === category.group),
    );

    return (
        <select
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className={
                className ||
                'h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950'
            }
        >
            <option value="">{placeholder}</option>
            {BILL_CATEGORY_GROUPS.map((group) => {
                const items = categories.filter((category) => category.group === group.key);
                if (items.length === 0) return null;
                return (
                    <optgroup key={group.key} label={group.label}>
                        {items.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </optgroup>
                );
            })}
            {others.length > 0 && (
                <optgroup label={OTHER_GROUP.label}>
                    {others.map((category) => (
                        <option key={category.id} value={category.id}>
                            {category.name}
                        </option>
                    ))}
                </optgroup>
            )}
        </select>
    );
}

// Cor de etiqueta/card por grupo (mesmo estilo das placas do Rota).
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

export function groupTone(group?: string | null) {
    return (group && GROUP_TONE[group]) || 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-500/40';
}
