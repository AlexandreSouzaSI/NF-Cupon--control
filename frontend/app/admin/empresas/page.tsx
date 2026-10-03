'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, ChevronRight, Plus, Store, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getUser, roleLabels, type UserRole } from '@/lib/auth';

type EmpresaRow = {
    id: string;
    name: string;
    cnpj: string | null;
    active: boolean;
    createdAt: string;
    _count: { stores: number; users: number };
};

type EmpresaDetail = {
    id: string;
    name: string;
    cnpj: string | null;
    active: boolean;
    adminNotes: string | null;
    stores: { id: string; name: string; active: boolean }[];
    users: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        role: UserRole;
        active: boolean;
        accountActivated: boolean;
        userStores: { store: { id: string; name: string } }[];
    }[];
};

const ROLE_OPTIONS: UserRole[] = [
    'PROPRIETARIO',
    'ADMINISTRATIVO',
    'GERENTE',
    'FUNCIONARIO',
];

export default function AdminEmpresasPage() {
    const router = useRouter();

    const [checking, setChecking] = useState(true);
    const [loading, setLoading] = useState(true);
    const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);

    const [showNewEmpresa, setShowNewEmpresa] = useState(false);
    const [newEmpresa, setNewEmpresa] = useState({ name: '', cnpj: '' });
    const [creatingEmpresa, setCreatingEmpresa] = useState(false);

    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [detail, setDetail] = useState<EmpresaDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    const [showNewStore, setShowNewStore] = useState(false);
    const [newStore, setNewStore] = useState({ name: '', cnpj: '' });
    const [creatingStore, setCreatingStore] = useState(false);

    const [showNewUser, setShowNewUser] = useState(false);
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'PROPRIETARIO' as UserRole,
        storeIds: [] as string[],
    });
    const [creatingUser, setCreatingUser] = useState(false);

    // Só você (isAdminMaster) chega aqui — mesma checagem de tela usada em
    // /admin/modules. O backend (AdminMasterGuard) é quem garante de
    // verdade; isso aqui só evita a tela piscar pra quem não devia tentar.
    useEffect(() => {
        const user = getUser();

        if (!user?.isAdminMaster) {
            router.replace('/home');
            return;
        }

        setChecking(false);
    }, [router]);

    async function loadEmpresas() {
        try {
            setLoading(true);
            const res = await api.get('/admin/empresas');
            setEmpresas(res.data);
        } catch {
            toast.error('Não deu pra carregar as empresas.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (checking) return;
        loadEmpresas();
    }, [checking]);

    async function loadDetail(id: string) {
        try {
            setLoadingDetail(true);
            const res = await api.get(`/admin/empresas/${id}`);
            setDetail(res.data);
        } catch {
            toast.error('Não deu pra carregar os dados dessa empresa.');
        } finally {
            setLoadingDetail(false);
        }
    }

    function toggleExpand(id: string) {
        if (expandedId === id) {
            setExpandedId(null);
            setDetail(null);
            setShowNewStore(false);
            setShowNewUser(false);
            return;
        }

        setExpandedId(id);
        setShowNewStore(false);
        setShowNewUser(false);
        loadDetail(id);
    }

    async function createEmpresa() {
        if (!newEmpresa.name.trim()) {
            toast.error('Informe o nome da empresa.');
            return;
        }

        try {
            setCreatingEmpresa(true);
            await api.post('/admin/empresas', {
                name: newEmpresa.name.trim(),
                cnpj: newEmpresa.cnpj.trim() || undefined,
            });
            toast.success('Empresa criada.');
            setNewEmpresa({ name: '', cnpj: '' });
            setShowNewEmpresa(false);
            await loadEmpresas();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Não deu pra criar a empresa.',
            );
        } finally {
            setCreatingEmpresa(false);
        }
    }

    async function createStore() {
        if (!expandedId || !newStore.name.trim()) {
            toast.error('Informe o nome da loja.');
            return;
        }

        try {
            setCreatingStore(true);
            await api.post(`/admin/empresas/${expandedId}/stores`, {
                name: newStore.name.trim(),
                cnpj: newStore.cnpj.trim() || undefined,
            });
            toast.success('Loja criada.');
            setNewStore({ name: '', cnpj: '' });
            setShowNewStore(false);
            await Promise.all([loadDetail(expandedId), loadEmpresas()]);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message || 'Não deu pra criar a loja.',
            );
        } finally {
            setCreatingStore(false);
        }
    }

    async function createUser() {
        if (!expandedId) return;

        if (!newUser.name.trim() || !newUser.email.trim()) {
            toast.error('Informe nome e e-mail.');
            return;
        }

        if (!newUser.phone.trim()) {
            toast.error(
                'Informe o telefone — é por ele que a pessoa recebe o link de ativação por WhatsApp.',
            );
            return;
        }

        if (newUser.storeIds.length === 0) {
            toast.error('Selecione pelo menos uma loja pra essa pessoa.');
            return;
        }

        try {
            setCreatingUser(true);
            await api.post(`/admin/empresas/${expandedId}/users`, {
                name: newUser.name.trim(),
                email: newUser.email.trim(),
                phone: newUser.phone.trim(),
                role: newUser.role,
                storeIds: newUser.storeIds,
            });
            toast.success(
                'Funcionário criado. Ele recebe um link de ativação por WhatsApp pra criar a própria senha.',
            );
            setNewUser({
                name: '',
                email: '',
                phone: '',
                role: 'PROPRIETARIO',
                storeIds: [],
            });
            setShowNewUser(false);
            await Promise.all([loadDetail(expandedId), loadEmpresas()]);
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                    'Não deu pra criar o funcionário.',
            );
        } finally {
            setCreatingUser(false);
        }
    }

    if (checking) {
        return null;
    }

    return (
        <AppLayout title="Empresas">
            <div className="space-y-6">
                <header className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                            <Building2 size={20} />
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold">Empresas</h2>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                Cada empresa é um cliente separado, com as
                                próprias lojas e o próprio time — ninguém de
                                uma empresa enxerga dados de outra. Crie a
                                empresa, depois a(s) loja(s) dela e o primeiro
                                funcionário (normalmente o Proprietário), que
                                a partir daí cadastra o resto do time sozinho.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowNewEmpresa((v) => !v)}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Plus size={16} />
                        Nova empresa
                    </button>
                </header>

                {showNewEmpresa && (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-zinc-500">
                                    Nome da empresa
                                </label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                    value={newEmpresa.name}
                                    onChange={(e) =>
                                        setNewEmpresa({ ...newEmpresa, name: e.target.value })
                                    }
                                    placeholder="Ex.: Restaurante Sabor Caseiro"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-zinc-500">
                                    CNPJ (opcional)
                                </label>
                                <input
                                    type="text"
                                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                    value={newEmpresa.cnpj}
                                    onChange={(e) =>
                                        setNewEmpresa({ ...newEmpresa, cnpj: e.target.value })
                                    }
                                />
                            </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                            <button
                                type="button"
                                disabled={creatingEmpresa}
                                onClick={createEmpresa}
                                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                                {creatingEmpresa ? 'Criando...' : 'Criar empresa'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowNewEmpresa(false)}
                                className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <p className="text-sm text-zinc-500">Carregando...</p>
                ) : empresas.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        Nenhuma empresa cadastrada ainda.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {empresas.map((empresa) => {
                            const expanded = expandedId === empresa.id;

                            return (
                                <div
                                    key={empresa.id}
                                    className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(empresa.id)}
                                        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                                    >
                                        <div className="flex items-center gap-2">
                                            {expanded ? (
                                                <ChevronDown size={16} className="text-zinc-400" />
                                            ) : (
                                                <ChevronRight size={16} className="text-zinc-400" />
                                            )}
                                            <div>
                                                <p className="font-medium">
                                                    {empresa.name}
                                                    {!empresa.active && (
                                                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                            Inativa
                                                        </span>
                                                    )}
                                                </p>
                                                {empresa.cnpj && (
                                                    <p className="text-xs text-zinc-500">
                                                        {empresa.cnpj}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <p className="shrink-0 text-xs text-zinc-500">
                                            {empresa._count.stores}{' '}
                                            {empresa._count.stores === 1 ? 'loja' : 'lojas'} •{' '}
                                            {empresa._count.users}{' '}
                                            {empresa._count.users === 1
                                                ? 'usuário'
                                                : 'usuários'}
                                        </p>
                                    </button>

                                    {expanded && (
                                        <div className="space-y-5 border-t border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                                            {loadingDetail || !detail ? (
                                                <p className="text-sm text-zinc-500">
                                                    Carregando...
                                                </p>
                                            ) : (
                                                <>
                                                    <section>
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                                                                <Store size={14} />
                                                                Lojas
                                                            </h3>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setShowNewStore((v) => !v)
                                                                }
                                                                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                                            >
                                                                + Nova loja
                                                            </button>
                                                        </div>

                                                        {detail.stores.length === 0 ? (
                                                            <p className="text-xs text-zinc-500">
                                                                Nenhuma loja ainda.
                                                            </p>
                                                        ) : (
                                                            <ul className="space-y-1 text-sm">
                                                                {detail.stores.map((store) => (
                                                                    <li
                                                                        key={store.id}
                                                                        className="rounded-lg bg-white px-3 py-1.5 dark:bg-zinc-950"
                                                                    >
                                                                        {store.name}
                                                                        {!store.active && (
                                                                            <span className="ml-2 text-xs text-zinc-400">
                                                                                (inativa)
                                                                            </span>
                                                                        )}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}

                                                        {showNewStore && (
                                                            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                                                                <div className="grid gap-2 sm:grid-cols-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Nome da loja"
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newStore.name}
                                                                        onChange={(e) =>
                                                                            setNewStore({
                                                                                ...newStore,
                                                                                name: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="CNPJ (opcional)"
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newStore.cnpj}
                                                                        onChange={(e) =>
                                                                            setNewStore({
                                                                                ...newStore,
                                                                                cnpj: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                </div>
                                                                <div className="mt-2 flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        disabled={creatingStore}
                                                                        onClick={createStore}
                                                                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                                                    >
                                                                        {creatingStore
                                                                            ? 'Criando...'
                                                                            : 'Criar loja'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setShowNewStore(false)
                                                                        }
                                                                        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </section>

                                                    <section>
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                                                                <UserPlus size={14} />
                                                                Usuários
                                                            </h3>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (detail.stores.length === 0) {
                                                                        toast.error(
                                                                            'Crie uma loja primeiro — o funcionário precisa estar vinculado a pelo menos uma.',
                                                                        );
                                                                        setShowNewStore(true);
                                                                        return;
                                                                    }
                                                                    setShowNewUser((v) => !v);
                                                                }}
                                                                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                                            >
                                                                + Novo funcionário
                                                            </button>
                                                        </div>

                                                        {detail.stores.length === 0 && (
                                                            <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                                                                Crie pelo menos uma loja antes de
                                                                cadastrar o primeiro funcionário.
                                                            </p>
                                                        )}

                                                        {detail.users.length === 0 ? (
                                                            <p className="text-xs text-zinc-500">
                                                                Nenhum usuário ainda.
                                                            </p>
                                                        ) : (
                                                            <ul className="space-y-1 text-sm">
                                                                {detail.users.map((user) => (
                                                                    <li
                                                                        key={user.id}
                                                                        className="rounded-lg bg-white px-3 py-1.5 dark:bg-zinc-950"
                                                                    >
                                                                        <span className="font-medium">
                                                                            {user.name}
                                                                        </span>{' '}
                                                                        <span className="text-xs text-zinc-500">
                                                                            {roleLabels[user.role]} •{' '}
                                                                            {user.email}
                                                                            {!user.accountActivated &&
                                                                                ' • convite pendente'}
                                                                        </span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}

                                                        {showNewUser && (
                                                            <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
                                                                <div className="grid gap-2 sm:grid-cols-2">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Nome"
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newUser.name}
                                                                        onChange={(e) =>
                                                                            setNewUser({
                                                                                ...newUser,
                                                                                name: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                    <input
                                                                        type="email"
                                                                        placeholder="E-mail"
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newUser.email}
                                                                        onChange={(e) =>
                                                                            setNewUser({
                                                                                ...newUser,
                                                                                email: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Telefone (WhatsApp, com DDD)"
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newUser.phone}
                                                                        onChange={(e) =>
                                                                            setNewUser({
                                                                                ...newUser,
                                                                                phone: e.target.value,
                                                                            })
                                                                        }
                                                                    />
                                                                    <select
                                                                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                                        value={newUser.role}
                                                                        onChange={(e) =>
                                                                            setNewUser({
                                                                                ...newUser,
                                                                                role: e.target.value as UserRole,
                                                                            })
                                                                        }
                                                                    >
                                                                        {ROLE_OPTIONS.map((role) => (
                                                                            <option key={role} value={role}>
                                                                                {roleLabels[role]}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                <div className="mt-2">
                                                                    <p className="mb-1 text-xs font-medium text-zinc-500">
                                                                        Lojas dessa pessoa
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {detail.stores.map((store) => {
                                                                            const checked =
                                                                                newUser.storeIds.includes(
                                                                                    store.id,
                                                                                );

                                                                            return (
                                                                                <label
                                                                                    key={store.id}
                                                                                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                                                                                >
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={checked}
                                                                                        onChange={() =>
                                                                                            setNewUser((prev) => ({
                                                                                                ...prev,
                                                                                                storeIds: checked
                                                                                                    ? prev.storeIds.filter(
                                                                                                          (id) =>
                                                                                                              id !== store.id,
                                                                                                      )
                                                                                                    : [
                                                                                                          ...prev.storeIds,
                                                                                                          store.id,
                                                                                                      ],
                                                                                            }))
                                                                                        }
                                                                                    />
                                                                                    {store.name}
                                                                                </label>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>

                                                                <div className="mt-3 flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        disabled={creatingUser}
                                                                        onClick={createUser}
                                                                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                                                                    >
                                                                        {creatingUser
                                                                            ? 'Criando...'
                                                                            : 'Criar funcionário'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            setShowNewUser(false)
                                                                        }
                                                                        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                                                                    >
                                                                        Cancelar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </section>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
