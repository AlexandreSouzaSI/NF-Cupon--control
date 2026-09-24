'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Flame, Pencil, ShieldCheck, UserPlus, Users, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
    canAssignRole,
    canDeleteForever,
    canGrantApprovalPermission,
    canGrantModuleAccess,
    getUser,
} from '@/lib/auth';
import { ALL_STORE_MODULES, moduleLabels, type StoreModuleKey } from '@/lib/menu';

type Store = {
    id: string;
    name: string;
};

type User = {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    role: string;
    active: boolean;
    canApprovePurchases?: boolean;
    notifyQuotationConfirmed?: boolean;
    moduleAccess?: StoreModuleKey[];
    canViewPayrollBills?: boolean;
    userStores: {
        store: Store;
    }[];
};

// Só pra exibir na listagem — mostra como a pessoa digitou, sem o "55" na
// frente que o backend guarda por baixo dos panos.
function formatPhoneDisplay(phone?: string | null) {
    if (!phone) return null;

    const local = phone.startsWith('55') ? phone.slice(2) : phone;

    if (local.length === 11) {
        return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }

    if (local.length === 10) {
        return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }

    return phone;
}

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
    const [showInactive, setShowInactive] = useState(false);
    const formRef = useRef<HTMLFormElement>(null);

    const [form, setForm] = useState({
        name: '',
        email: '',
        phone: '',
        password: '',
        role: 'FUNCIONARIO',
        active: true,
        storeIds: [] as string[],
        canApprovePurchases: false,
        notifyQuotationConfirmed: false,
        moduleAccess: [] as StoreModuleKey[],
        canViewPayrollBills: true,
    });

    const loggedUser = getUser();

    // Só quem já aprova compra por conta própria (Admin Master ou
    // Proprietário) pode conceder essa permissão extra pra outro usuário —
    // ver ensureCanGrantApprovalPermission no backend (users.service.ts).
    const canEditApprovalPermission = canGrantApprovalPermission(loggedUser);

    // Só o Proprietário (ou Admin Master) decide quais módulos cada
    // colaborador acessa e se ele vê valor de conta Funcionários/
    // Freelancer — ver ensureCanGrantModuleAccess no backend
    // (users.service.ts).
    const canEditModuleAccess = canGrantModuleAccess(loggedUser);
    const podeExcluirDeVez = canDeleteForever(loggedUser);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Some da lista de opções quando: (a) é um perfil legado fora de foco
    // (hidden) e não é o perfil já selecionado, ou (b) o usuário logado não
    // tem permissão de atribuir esse perfil (ex: Administrativo não pode
    // colocar ninguém como Proprietário). Na edição, mantém visível o
    // perfil atual mesmo sem permissão de atribuí-lo de novo, só pra não
    // sumir o valor do campo — o back-end continua sendo quem decide de
    // verdade se o salvamento é permitido.
    const selectableRoles = roles.filter((role) => {
        const isCurrentValue = role.value === form.role;

        if (role.hidden) return isCurrentValue;

        if (!loggedUser || canAssignRole(loggedUser, role.value as any)) {
            return true;
        }

        return editingUser ? isCurrentValue : false;
    });

    // Sem isso, um usuário novo sempre começa com role "Funcionário" no
    // estado do form — se quem está logado não pode atribuir esse perfil,
    // a opção some da lista mas o valor selecionado ficaria "travado" nela.
    useEffect(() => {
        if (editingUser) return;
        if (selectableRoles.some((role) => role.value === form.role)) return;

        const fallback = selectableRoles[0];
        if (fallback) {
            setForm((current) => ({ ...current, role: fallback.value }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectableRoles, editingUser]);

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
            phone: '',
            password: '',
            role: 'FUNCIONARIO',
            active: true,
            storeIds: [],
            canApprovePurchases: false,
            notifyQuotationConfirmed: false,
            moduleAccess: [],
            canViewPayrollBills: true,
        });
    }

    function startEdit(user: User) {
        setEditingUser(user);

        setForm({
            name: user.name,
            email: user.email,
            phone: formatPhoneDisplay(user.phone) || '',
            password: '',
            role: user.role,
            active: user.active,
            storeIds: user.userStores.map((item) => item.store.id),
            canApprovePurchases: user.canApprovePurchases || false,
            notifyQuotationConfirmed: user.notifyQuotationConfirmed || false,
            moduleAccess: user.moduleAccess || [],
            canViewPayrollBills: user.canViewPayrollBills ?? true,
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

    function toggleModuleAccess(module: StoreModuleKey) {
        const exists = form.moduleAccess.includes(module);

        setForm({
            ...form,
            moduleAccess: exists
                ? form.moduleAccess.filter((item) => item !== module)
                : [...form.moduleAccess, module],
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
                phone: form.phone.trim() || undefined,
                role: form.role,
                active: form.active,
                storeIds: form.storeIds,
                notifyQuotationConfirmed: form.notifyQuotationConfirmed,
            };

            if (form.password.trim()) {
                payload.password = form.password;
            }

            // Só manda esse campo se quem está logado pode concedê-lo —
            // senão, se um editor sem essa permissão salvar o form (sem
            // nunca ter visto o toggle), não queremos sobrescrever o valor
            // que já existia no usuário.
            if (canEditApprovalPermission) {
                payload.canApprovePurchases = form.canApprovePurchases;
            }

            // Mesmo espírito do canApprovePurchases acima: só manda se
            // quem está logado pode editar, senão não sobrescreve o que
            // já estava salvo pra essa pessoa.
            if (canEditModuleAccess) {
                payload.moduleAccess = form.moduleAccess;
                payload.canViewPayrollBills = form.canViewPayrollBills;
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

    // Usuário desativado ("excluído") continua existindo no banco (soft
    // delete, nunca apaga de verdade — ver docs/BUSINESS_RULES.md), mas por
    // padrão some da lista: sem isso, "Desativar" parecia não fazer nada,
    // já que a linha continuava visível com o badge "Inativo".
    const visibleUsers = showInactive
        ? users
        : users.filter((user) => user.active);

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

    // Exclusão de verdade — só a conta dona do sistema (isAdminMaster) vê
    // esse botão. O backend recusa excluir a própria conta ou outra conta
    // Admin Master (AdminMasterGuard + regra em users.service.ts).
    async function handleRemoveDefinitivo(user: User) {
        const confirmed = confirm(
            `Excluir "${user.name}" definitivamente? Isso apaga o cadastro de vez, sem volta (diferente de desativar).`,
        );

        if (!confirmed) return;

        try {
            setDeletingId(user.id);
            await api.delete(`/users/${user.id}/definitivo`);
            toast.success('Usuário excluído definitivamente.');
            await loadData();
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao excluir usuário.',
            );
        } finally {
            setDeletingId(null);
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
                            data-tour="user-form-name"
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
                            data-tour="user-form-email"
                            value={form.email}
                            onChange={(e) =>
                                setForm({ ...form, email: e.target.value })
                            }
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Telefone (WhatsApp)
                        </label>
                        <input
                            value={form.phone}
                            onChange={(e) =>
                                setForm({ ...form, phone: e.target.value })
                            }
                            placeholder="(31) 99999-8888"
                            className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                        />
                        <p className="mt-1 text-xs text-zinc-500">
                            Opcional — usado só pra mandar aviso de tarefa no
                            WhatsApp. Login continua sendo por e-mail.
                        </p>
                    </div>

                    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                            <input
                                type="checkbox"
                                checked={form.notifyQuotationConfirmed}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        notifyQuotationConfirmed: e.target.checked,
                                    })
                                }
                            />
                            Avisar quando fornecedor confirmar pedido de cotação
                        </label>
                        <p className="mt-1 text-xs text-zinc-500">
                            Manda um WhatsApp pra essa pessoa toda vez que um
                            fornecedor aceitar um pedido de cotação. Pode marcar
                            mais de uma pessoa. Precisa de telefone cadastrado
                            acima pra funcionar.
                        </p>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Senha {editingUser && '(deixe vazio para manter)'}
                        </label>
                        <input
                            data-tour="user-form-password"
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
                            data-tour="user-form-role"
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

                    {canEditApprovalPermission && (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
                            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={form.canApprovePurchases}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            canApprovePurchases: e.target.checked,
                                        })
                                    }
                                />
                                Pode aprovar compras (permissão extra)
                            </label>
                            <p className="mt-1 text-xs text-zinc-500">
                                Comprador, Proprietário e Admin Master já aprovam
                                por padrão. Marque aqui só pra liberar aprovação
                                pra um usuário de outro perfil (ex.: Administrativo,
                                Gerente).
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                            Lojas
                        </label>

                        <div
                            data-tour="user-form-stores"
                            className="grid grid-cols-2 gap-2"
                        >
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

                    {canEditModuleAccess && (
                        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
                            <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                Módulos liberados pra essa pessoa
                            </p>
                            <p className="mb-3 text-xs text-zinc-500">
                                Sem nada marcado, vale o que o perfil já
                                libera normalmente (comportamento de
                                sempre). Marque só pra restringir essa
                                pessoa a alguns módulos específicos, além
                                do que o perfil e a loja já permitem.
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                {ALL_STORE_MODULES.map((module) => (
                                    <label
                                        key={module}
                                        className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={form.moduleAccess.includes(module)}
                                            onChange={() => toggleModuleAccess(module)}
                                        />
                                        <span>{moduleLabels[module]}</span>
                                    </label>
                                ))}
                            </div>

                            <div className="mt-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                                    <input
                                        type="checkbox"
                                        checked={form.canViewPayrollBills}
                                        onChange={(e) =>
                                            setForm({
                                                ...form,
                                                canViewPayrollBills: e.target.checked,
                                            })
                                        }
                                    />
                                    Ver contas a pagar de Funcionários/Freelancer
                                </label>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Dentro de Contas a Pagar, contas com
                                    categoria "Funcionários" ou "Freelancer"
                                    só aparecem pra quem tem isso marcado —
                                    quem não tem, nem vê a conta na lista.
                                    Só importa pra quem já acessa Contas a
                                    Pagar (perfil ou módulo liberado acima).
                                </p>
                            </div>
                        </div>
                    )}

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
                            data-tour="user-form-submit"
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

                <label className="mb-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                    <input
                        type="checkbox"
                        checked={showInactive}
                        onChange={(e) => setShowInactive(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                    />
                    Mostrar desativados
                </label>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : visibleUsers.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {users.length === 0
                            ? 'Nenhum usuário encontrado.'
                            : 'Nenhum usuário ativo. Marque "Mostrar desativados" pra ver os desativados.'}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {visibleUsers.map((user) => (
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

                                            {user.canApprovePurchases && (
                                                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                                                    Aprova compras (extra)
                                                </span>
                                            )}

                                            {user.notifyQuotationConfirmed && (
                                                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-500">
                                                    Avisa pedido confirmado
                                                </span>
                                            )}

                                            {user.moduleAccess &&
                                                user.moduleAccess.length > 0 && (
                                                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                                                        Módulos restritos
                                                    </span>
                                                )}

                                            {user.canViewPayrollBills === false && (
                                                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                                                    Sem ver Func./Freelancer
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            {user.email} •{' '}
                                            {roles.find((role) => role.value === user.role)
                                                ?.label || user.role}
                                            {user.phone &&
                                                ` • ${formatPhoneDisplay(user.phone)}`}
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

                                        {podeExcluirDeVez &&
                                            user.id !== loggedUser?.id && (
                                                <button
                                                    onClick={() =>
                                                        handleRemoveDefinitivo(
                                                            user,
                                                        )
                                                    }
                                                    disabled={
                                                        deletingId === user.id
                                                    }
                                                    title="Excluir definitivamente (Admin Master)"
                                                    className="rounded-xl border border-red-700/40 bg-red-700/10 p-2 text-red-700 hover:bg-red-700/20 disabled:opacity-50 dark:text-red-500"
                                                >
                                                    <Flame size={16} />
                                                </button>
                                            )}
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
