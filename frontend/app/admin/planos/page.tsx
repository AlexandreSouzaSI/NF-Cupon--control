'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser } from '@/lib/auth';
import {
    formatBRL,
    formatDateBR,
    type PlanDto,
    type SubscriptionStatus,
} from '@/lib/billing';

type AdminPlan = PlanDto & { _count?: { subscriptions: number } };

type ModuleCatalogItem = { value: string; label: string };

type SubscriptionRow = {
    empresaId: string;
    empresaName: string;
    active: boolean;
    planExempt: boolean;
    subscription: null | {
        id: string;
        status: SubscriptionStatus;
        planId: string;
        planName: string;
        priceCents: number;
        currentPeriodEnd: string | null;
        modulesBlockedAt: string | null;
        viaAsaas: boolean;
    };
};

type PlanForm = {
    id?: string;
    name: string;
    description: string;
    // Em reais na tela (ex.: "199,90") — convertido pra centavos ao salvar.
    price: string;
    sortOrder: string;
    active: boolean;
    modules: string[];
};

const EMPTY_FORM: PlanForm = {
    name: '',
    description: '',
    price: '',
    sortOrder: '0',
    active: true,
    modules: [],
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
    PENDING: 'Aguardando pagamento',
    ACTIVE: 'Ativa',
    PAST_DUE: 'Vencida',
    CANCELED: 'Cancelada',
};

const STATUS_STYLE: Record<SubscriptionStatus, string> = {
    PENDING: 'bg-amber-500/10 text-amber-500',
    ACTIVE: 'bg-emerald-500/10 text-emerald-500',
    PAST_DUE: 'bg-red-500/10 text-red-500',
    CANCELED: 'bg-zinc-500/10 text-zinc-500',
};

function parsePriceToCents(value: string) {
    const normalized = value.replace(/\./g, '').replace(',', '.').trim();
    const number = Number(normalized);

    return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

export default function AdminPlanosPage() {
    const router = useRouter();

    const [checking, setChecking] = useState(true);
    const [tab, setTab] = useState<'plans' | 'subscriptions'>('plans');

    const [plans, setPlans] = useState<AdminPlan[]>([]);
    const [catalog, setCatalog] = useState<ModuleCatalogItem[]>([]);
    const [rows, setRows] = useState<SubscriptionRow[]>([]);
    const [loading, setLoading] = useState(true);

    const [form, setForm] = useState<PlanForm | null>(null);
    const [saving, setSaving] = useState(false);

    // Liberação manual: empresa escolhida + plano + dias.
    const [grantFor, setGrantFor] = useState<SubscriptionRow | null>(null);
    const [grantPlanId, setGrantPlanId] = useState('');
    const [grantDays, setGrantDays] = useState('30');
    const [busyEmpresaId, setBusyEmpresaId] = useState<string | null>(null);

    // Só o Admin Master chega aqui; a checagem de verdade é no backend
    // (AdminMasterGuard) — isso só evita piscar a tela pra quem não devia.
    useEffect(() => {
        if (!getUser()?.isAdminMaster) {
            router.replace('/home');
            return;
        }

        setChecking(false);
    }, [router]);

    const load = useCallback(async () => {
        try {
            setLoading(true);

            const [plansRes, catalogRes, subsRes] = await Promise.all([
                api.get('/admin/plans'),
                api.get('/stores/admin/modules-catalog'),
                api.get('/admin/subscriptions'),
            ]);

            setPlans(plansRes.data);
            setCatalog(catalogRes.data);
            setRows(subsRes.data);
        } catch {
            toast.error('Não deu pra carregar planos e assinaturas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!checking) load();
    }, [checking, load]);

    function openNewPlan() {
        setForm({ ...EMPTY_FORM });
    }

    function openEditPlan(plan: AdminPlan) {
        setForm({
            id: plan.id,
            name: plan.name,
            description: plan.description || '',
            price: (plan.priceCents / 100).toFixed(2).replace('.', ','),
            sortOrder: String(plan.sortOrder),
            active: plan.active,
            modules: plan.modules,
        });
    }

    function toggleFormModule(module: string) {
        setForm((current) => {
            if (!current) return current;

            return {
                ...current,
                modules: current.modules.includes(module)
                    ? current.modules.filter((item) => item !== module)
                    : [...current.modules, module],
            };
        });
    }

    async function savePlan(event: React.FormEvent) {
        event.preventDefault();

        if (!form) return;

        const priceCents = parsePriceToCents(form.price);

        if (!Number.isFinite(priceCents) || priceCents < 500) {
            toast.error('Informe um preço válido (mínimo R$ 5,00).');
            return;
        }

        if (form.modules.length === 0) {
            toast.error('Escolha ao menos um módulo para o plano.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            priceCents,
            modules: form.modules,
            active: form.active,
            sortOrder: Number(form.sortOrder) || 0,
        };

        try {
            setSaving(true);

            if (form.id) {
                await api.patch(`/admin/plans/${form.id}`, payload);
            } else {
                await api.post('/admin/plans', payload);
            }

            toast.success('Plano salvo.');
            setForm(null);
            await load();
        } catch (error: any) {
            const raw = error?.response?.data?.message;
            toast.error(
                Array.isArray(raw) ? raw.join(', ') : raw || 'Não deu pra salvar o plano.',
            );
        } finally {
            setSaving(false);
        }
    }

    async function togglePlanActive(plan: AdminPlan) {
        try {
            await api.patch(`/admin/plans/${plan.id}`, { active: !plan.active });
            await load();
        } catch {
            toast.error('Não deu pra alterar o plano.');
        }
    }

    function openGrant(row: SubscriptionRow) {
        setGrantFor(row);
        setGrantPlanId(row.subscription?.planId || plans[0]?.id || '');
        setGrantDays('30');
    }

    async function confirmGrant(event: React.FormEvent) {
        event.preventDefault();

        if (!grantFor) return;

        try {
            setBusyEmpresaId(grantFor.empresaId);
            await api.post(`/admin/subscriptions/${grantFor.empresaId}/grant`, {
                planId: grantPlanId,
                days: Number(grantDays) || 30,
            });
            toast.success(`${grantFor.empresaName}: acesso liberado.`);
            setGrantFor(null);
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Não deu pra liberar.');
        } finally {
            setBusyEmpresaId(null);
        }
    }

    async function blockEmpresa(row: SubscriptionRow) {
        if (
            !window.confirm(
                `Bloquear ${row.empresaName}? Os módulos do plano somem das lojas dela agora.`,
            )
        ) {
            return;
        }

        try {
            setBusyEmpresaId(row.empresaId);
            await api.post(`/admin/subscriptions/${row.empresaId}/block`);
            toast.success(`${row.empresaName}: módulos removidos.`);
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Não deu pra bloquear.');
        } finally {
            setBusyEmpresaId(null);
        }
    }

    async function togglePlanExempt(row: SubscriptionRow) {
        try {
            setBusyEmpresaId(row.empresaId);
            await api.patch(`/admin/empresas/${row.empresaId}`, {
                planExempt: !row.planExempt,
            });
            await load();
        } catch {
            toast.error('Não deu pra alterar a isenção.');
        } finally {
            setBusyEmpresaId(null);
        }
    }

    if (checking) return null;

    return (
        <AppLayout title="Planos e assinaturas">
            <div className="space-y-6">
                <header className="flex items-start gap-3">
                    <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                        <CreditCard size={20} />
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold">Planos e assinaturas</h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Cadastre os planos que aparecem em /planos e acompanhe
                            quem está pagando. Empresa marcada como isenta nunca
                            vê planos nem é bloqueada.
                        </p>
                    </div>
                </header>

                <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
                    {(
                        [
                            ['plans', 'Planos'],
                            ['subscriptions', 'Assinaturas por empresa'],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key
                                    ? 'border-blue-500 text-blue-500'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-500">Carregando...</p>
                ) : tab === 'plans' ? (
                    <div className="space-y-4">
                        <button
                            onClick={openNewPlan}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                        >
                            <Plus size={16} />
                            Novo plano
                        </button>

                        {plans.length === 0 ? (
                            <p className="text-sm text-zinc-500">
                                Nenhum plano cadastrado ainda.
                            </p>
                        ) : (
                            <div className="grid gap-3 lg:grid-cols-2">
                                {plans.map((plan) => (
                                    <div
                                        key={plan.id}
                                        className={`rounded-2xl border p-4 ${plan.active
                                                ? 'border-zinc-200 dark:border-zinc-800'
                                                : 'border-dashed border-zinc-300 dark:border-zinc-700 opacity-70'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-semibold">
                                                    {plan.name}
                                                    {!plan.active && (
                                                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                            Inativo
                                                        </span>
                                                    )}
                                                </p>
                                                <p className="text-sm text-zinc-500">
                                                    {formatBRL(plan.priceCents)}/mês •{' '}
                                                    {plan._count?.subscriptions ?? 0}{' '}
                                                    assinatura(s) • ordem {plan.sortOrder}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 gap-2">
                                                <button
                                                    onClick={() => openEditPlan(plan)}
                                                    title="Editar"
                                                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    onClick={() => togglePlanActive(plan)}
                                                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                                >
                                                    {plan.active ? 'Desativar' : 'Ativar'}
                                                </button>
                                            </div>
                                        </div>

                                        <p className="mt-3 flex flex-wrap gap-1.5">
                                            {plan.modules.map((module) => (
                                                <span
                                                    key={module}
                                                    className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500"
                                                >
                                                    {catalog.find((item) => item.value === module)
                                                        ?.label || module}
                                                </span>
                                            ))}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <table className="w-full min-w-[760px] border-collapse text-sm">
                            <thead>
                                <tr className="bg-zinc-100 dark:bg-zinc-900 text-left">
                                    <th className="px-4 py-3 font-semibold">Empresa</th>
                                    <th className="px-4 py-3 font-semibold">Plano</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                    <th className="px-4 py-3 font-semibold">Vence em</th>
                                    <th className="px-4 py-3 font-semibold">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, index) => {
                                    const busy = busyEmpresaId === row.empresaId;

                                    return (
                                        <tr
                                            key={row.empresaId}
                                            className={
                                                index % 2 === 0
                                                    ? 'bg-white dark:bg-zinc-950'
                                                    : 'bg-zinc-50 dark:bg-zinc-900/40'
                                            }
                                        >
                                            <td className="px-4 py-3 font-medium">
                                                {row.empresaName}
                                                {row.planExempt && (
                                                    <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-500">
                                                        Isenta
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {row.subscription ? (
                                                    <>
                                                        {row.subscription.planName}
                                                        <span className="block text-xs text-zinc-500">
                                                            {formatBRL(row.subscription.priceCents)}
                                                            {row.subscription.viaAsaas
                                                                ? ' • Asaas'
                                                                : ' • manual'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-zinc-500">
                                                        {row.planExempt ? '—' : 'Sem plano'}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {row.subscription && (
                                                    <span
                                                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[row.subscription.status]}`}
                                                    >
                                                        {STATUS_LABEL[row.subscription.status]}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {formatDateBR(row.subscription?.currentPeriodEnd)}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {!row.planExempt && (
                                                        <>
                                                            <button
                                                                disabled={busy || plans.length === 0}
                                                                onClick={() => openGrant(row)}
                                                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                                            >
                                                                Liberar
                                                            </button>
                                                            {row.subscription &&
                                                                !row.subscription.modulesBlockedAt && (
                                                                    <button
                                                                        disabled={busy}
                                                                        onClick={() => blockEmpresa(row)}
                                                                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                                                    >
                                                                        Bloquear
                                                                    </button>
                                                                )}
                                                        </>
                                                    )}

                                                    <button
                                                        disabled={busy}
                                                        onClick={() => togglePlanExempt(row)}
                                                        className="rounded-lg border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
                                                    >
                                                        {row.planExempt
                                                            ? 'Tornar cobrável'
                                                            : 'Isentar'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal: criar/editar plano */}
            {form && (
                <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
                    <form
                        onSubmit={savePlan}
                        className="w-full max-w-lg space-y-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
                    >
                        <h3 className="text-lg font-bold">
                            {form.id ? 'Editar plano' : 'Novo plano'}
                        </h3>

                        <div>
                            <label className="mb-1 block text-sm">Nome</label>
                            <input
                                required
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Descrição</label>
                            <textarea
                                value={form.description}
                                onChange={(e) =>
                                    setForm({ ...form, description: e.target.value })
                                }
                                rows={2}
                                className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 py-2 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-1 block text-sm">
                                    Preço mensal (R$)
                                </label>
                                <input
                                    required
                                    inputMode="decimal"
                                    placeholder="199,90"
                                    value={form.price}
                                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-sm">Ordem</label>
                                <input
                                    type="number"
                                    value={form.sortOrder}
                                    onChange={(e) =>
                                        setForm({ ...form, sortOrder: e.target.value })
                                    }
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <div>
                            <p className="mb-2 text-sm">Módulos incluídos</p>
                            <div className="grid grid-cols-2 gap-2">
                                {catalog.map((module) => (
                                    <label
                                        key={module.value}
                                        className="flex items-center gap-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 accent-blue-500"
                                            checked={form.modules.includes(module.value)}
                                            onChange={() => toggleFormModule(module.value)}
                                        />
                                        {module.label}
                                    </label>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-zinc-500">
                                O plano define o conjunto de módulos das lojas da
                                empresa quando o pagamento é confirmado.
                            </p>
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-blue-500"
                                checked={form.active}
                                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                            />
                            Ativo (aparece pra venda)
                        </label>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setForm(null)}
                                className="h-11 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="h-11 flex-1 rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Modal: liberar manualmente */}
            {grantFor && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
                    <form
                        onSubmit={confirmGrant}
                        className="w-full max-w-sm space-y-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
                    >
                        <div>
                            <h3 className="text-lg font-bold">Liberar acesso</h3>
                            <p className="text-sm text-zinc-500">{grantFor.empresaName}</p>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Plano</label>
                            <select
                                value={grantPlanId}
                                onChange={(e) => setGrantPlanId(e.target.value)}
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3"
                            >
                                {plans.map((plan) => (
                                    <option key={plan.id} value={plan.id}>
                                        {plan.name} — {formatBRL(plan.priceCents)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm">Dias liberados</label>
                            <input
                                type="number"
                                min={1}
                                value={grantDays}
                                onChange={(e) => setGrantDays(e.target.value)}
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setGrantFor(null)}
                                className="h-11 flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={busyEmpresaId === grantFor.empresaId}
                                className="h-11 flex-1 rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                Liberar
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </AppLayout>
    );
}
