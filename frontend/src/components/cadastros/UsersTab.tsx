'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Pencil, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';
import { toast } from 'sonner';

type Store = {
    id: string;
    name: string;
};

type User = {
    id: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    userStores: {
        store: Store;
    }[];
};

const roles = [
    {
        value: 'PROPRIETARIO',
        label: 'Proprietário',
        permissions:
            'Acesso total, sempre: todas as lojas, todas as telas, todas as tarefas — nunca é restringido por ninguém. É o único que pode ocultar uma tarefa do Administrativo.',
    },
    {
        value: 'ADMINISTRATIVO',
        label: 'Administrativo',
        permissions:
            'Acesso total às lojas vinculadas e vê todas as tarefas, igual ao Proprietário — a não ser que o Proprietário restrinja uma tarefa específica só pra ele não ver. Pode ocultar tarefas do Gerente.',
    },
    {
        value: 'GERENTE',
        label: 'Gerente',
        permissions:
            'Acesso operacional nas lojas vinculadas (compras, tarefas, perdas, serviços). Vê todas as tarefas da loja, a não ser que o Proprietário ou o Administrativo restrinjam alguma só pra ele não ver. Não gerencia usuários Administrativo/Proprietário/Gerente nem restringe tarefas de ninguém.',
    },
    {
        value: 'FUNCIONARIO',
        label: 'Funcionário',
        permissions:
            'Perfil restrito do projeto reduzido: só vê e responde às próprias tarefas (criadas por ele ou atribuídas a ele) e só acessa Perdas — sem Serviços, Compras ou Cadastros.',
    },
    // Perfis fora de foco por enquanto (mesma lógica reversível do menu:
    // continuam existindo pra quem já tem esse perfil, mas somem da lista
    // de opções ao criar/editar — é só tirar o "hidden" quando o módulo de
    // Compras/Financeiro voltar a ficar visível).
    {
        value: 'COMPRADOR',
        label: 'Comprador',
        permissions:
            'Registra e acompanha compras, tarefas e perdas nas lojas vinculadas. Só vê tarefas que criou ou que foram atribuídas a ele.',
        hidden: true,
    },
    {
        value: 'ESTOQUISTA',
        label: 'Estoquista',
        permissions:
            'Recebe compras e registra perdas e tarefas nas lojas vinculadas. Só vê tarefas que criou ou que foram atribuídas a ele.',
        hidden: true,
    },
    {
        value: 'FINANCEIRO',
        label: 'Financeiro',
        permissions:
            'Contas a pagar, tributos e alertas financeiros nas lojas vinculadas. Só vê tarefas que criou ou que foram atribuídas a ele.',
        hidden: true,
    },
];

export function UsersTab() {
    const [users, setUsers] = useState<User[]>([]);
    const [stores, setStores] = useState<Store[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: 'FUNCIONARIO',
        active: true,
        storeIds: [] as string[],
    });

    // Some da lista de opções, exceto se for o perfil já selecionado (ex:
    // editando um usuário Comprador antigo — continua aparecendo pra não
    // sumir o valor do campo, mas não aparece como opção pra usuário novo).
    const selectableRoles = roles.filter(
        (role) => !role.hidden || role.value === form.role,
    );

    async function loadData() {
        try {
            setLoading(true);

            const [usersResponse, storesResponse] = await Promise.all([
                api.get('/users'),
                api.get('/stores'),
            ]);

            setUsers(usersResponse.data);
            setStores(storesResponse.data);
        } catch {
            toast.error('Erro ao carregar usuários.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    function resetForm() {
        setEditingUser(null);
        setForm({
            name: '',
            email: '',
            password: '',
            role: 'FUNCIONARIO',
            active: true,
            storeIds: [],
        });
    }

    function startEdit(user: User) {
        setEditingUser(user);

        setForm({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
            active: user.active,
            storeIds: user.userStores.map((item) => item.store.id),
        });

        // O form fica acima da lista (ou antes dela, empilhado no
        // celular) — sem isso, clicar em "Editar" num usuário lá embaixo
        // da lista muda o form mas ele fica fora da tela, parecendo que
        // nada aconteceu.
        requestAnimationFrame(() => {
            formRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    }

    function toggleStore(storeId: string) {
        const exists = form.storeIds.includes(storeId);

        setForm({
            ...form,
            storeIds: exists
                ? form.storeIds.filter((id) => id !== storeId)
                : [...form.storeIds, storeId],
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!form.name.trim()) {
            toast.error('Informe o nome.');
            return;
        }

        if (!form.email.trim()) {
            toast.error('Informe o e-mail.');
            return;
        }

        if (!editingUser && !form.password.trim()) {
            toast.error('Informe a senha.');
            return;
        }

        try {
            setSaving(true);

            const payload: any = {
                name: form.name,
                email: form.email,
                role: form.role,
                active: form.active,
                storeIds: form.storeIds,
            };

            if (form.password.trim()) {
                payload.password = form.password;
            }

            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, payload);
                toast.success('Usuário atualizado.');
            } else {
                await api.post('/users', payload);
                toast.success('Usuário cadastrado.');
            }

            resetForm();
            await loadData();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao salvar usuário.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(user: User) {
        const confirmed = confirm(`Desativar o usuário "${user.name}"?`);

        if (!confirmed) return;

        try {
            await api.delete(`/users/${user.id}`);
            toast.success('Usuário desativado.');
            await loadData();
        } catch {
            toast.error('Erro ao desativar usuário.');
        }
    }

    return (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
            <form
                ref={formRef}
                onSubmit={handleSubmit}
                className={`rounded-3xl border bg-white dark:bg-zinc-900 p-5 transition ${editingUser
                    ? 'border-emerald-400 ring-2 ring-emerald-400/30'
                    : 'border-zinc-200 dark:border-zinc-800'
                    }`}
            >
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                        <UserPlus size={22} />
                    </div>

                    <div>
                        <h2 className="text-lg font-bold">
                            {editingUser ? 'Editar usuário' : 'Novo usuário'}
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Perfil e lojas que a pessoa pode acessar
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
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            E-mail
                        </label>
                        <input
                            value={form.email}
                            onChange={(e) =>
                                setForm({ ...form, email: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Senha {editingUser && '(deixe vazio para manter)'}
                        </label>
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) =>
                                setForm({ ...form, password: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Perfil (permissões de acesso)
                        </label>
                        <select
                            value={form.role}
                            onChange={(e) =>
                                setForm({ ...form, role: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        >
                            {selectableRoles.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>

                        <div className="mt-2 flex items-start gap-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 p-3 text-xs text-zinc-600 dark:text-zinc-400">
                            <ShieldCheck
                                size={14}
                                className="mt-0.5 shrink-0 text-emerald-500"
                            />
                            <span>
                                {
                                    roles.find(
                                        (role) => role.value === form.role,
                                    )?.permissions
                                }
                            </span>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Lojas
                        </label>

                        <div className="grid grid-cols-2 gap-2">
                            {stores.map((store) => (
                                <label
                                    key={store.id}
                                    className="flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm"
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.storeIds.includes(store.id)}
                                        onChange={() => toggleStore(store.id)}
                                    />
                                    <span>{store.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                        <input
                            type="checkbox"
                            checked={form.active}
                            onChange={(e) =>
                                setForm({ ...form, active: e.target.checked })
                            }
                        />
                        Usuário ativo
                    </label>

                    <div className="flex gap-3">
                        <button
                            disabled={saving}
                            className="h-12 flex-1 rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {saving
                                ? 'Salvando...'
                                : editingUser
                                    ? 'Salvar alterações'
                                    : 'Criar usuário'}
                        </button>

                        {editingUser && (
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
                        <h2 className="text-lg font-bold">Usuários cadastrados</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Quem tem acesso ao sistema e em qual loja
                        </p>
                    </div>

                    <Users className="text-zinc-500" />
                </div>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : users.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum usuário encontrado.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {users.map((user) => (
                            <div
                                key={user.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">{user.name}</p>

                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.active
                                                    ? 'bg-emerald-500/10 text-emerald-400'
                                                    : 'bg-red-500/10 text-red-400'
                                                    }`}
                                            >
                                                {user.active ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>

                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            {user.email} •{' '}
                                            {roles.find((role) => role.value === user.role)
                                                ?.label || user.role}
                                        </p>

                                        <p className="mt-1 text-sm text-zinc-500">
                                            {user.userStores.length > 0
                                                ? user.userStores
                                                    .map((item) => item.store.name)
                                                    .join(', ')
                                                : 'Sem loja vinculada'}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => startEdit(user)}
                                            className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                        >
                                            <Pencil size={16} />
                                            Editar
                                        </button>

                                        <button
                                            onClick={() => handleRemove(user)}
                                            title="Desativar usuário"
                                            className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                        >
                                            <UserX size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
