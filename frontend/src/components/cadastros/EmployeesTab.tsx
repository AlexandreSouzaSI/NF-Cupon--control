'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Pencil,
    Plus,
    Trash2,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';

type Employee = {
    id: string;
    name: string;
    cpf?: string | null;
    role?: string | null;
    phone?: string | null;
    admissionDate?: string | null;
    active: boolean;
    notes?: string | null;
    salary?: string | null;
    advanceValue?: string | null;
    advanceDay?: number | null;
    paymentValue?: string | null;
    paymentDay?: number | null;
    vtValue?: string | null;
    bonusValue?: string | null;
    bonusDay?: number | null;
    paymentMethod?: string | null;
    pixKey?: string | null;
    pixKeyType?: string | null;
};

const emptyForm = {
    name: '',
    cpf: '',
    role: '',
    phone: '',
    admissionDate: '',
    notes: '',
    salary: '',
    advanceValue: '',
    advanceDay: '',
    paymentValue: '',
    paymentDay: '',
    vtValue: '',
    bonusValue: '',
    bonusDay: '',
    paymentMethod: 'PIX',
    pixKey: '',
    pixKeyType: 'CPF',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    PIX: 'Pix',
    DINHEIRO: 'Dinheiro',
    TRANSFERENCIA: 'Transferência',
    BOLETO: 'Boleto',
    OUTRO: 'Outro',
};

const PIX_KEY_TYPE_LABELS: Record<string, string> = {
    CPF: 'CPF',
    CNPJ: 'CNPJ',
    EMAIL: 'E-mail',
    PHONE: 'Telefone',
    RANDOM: 'Chave aleatória',
    EVP: 'EVP',
};

function formatCurrency(value?: string | number | null) {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function EmployeesTab() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState<Employee | null>(
        null,
    );

    const [form, setForm] = useState(emptyForm);

    async function loadEmployees() {
        try {
            setLoading(true);

            const response = await api.get('/employees', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setEmployees(response.data || []);
        } catch {
            toast.error('Erro ao carregar funcionários.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadEmployees();
    }, []);

    function resetForm() {
        setForm(emptyForm);
        setEditingEmployee(null);
        setShowForm(false);
    }

    function startCreate() {
        setForm(emptyForm);
        setEditingEmployee(null);
        setShowForm(true);
    }

    function startEdit(employee: Employee) {
        setEditingEmployee(employee);
        setForm({
            name: employee.name || '',
            cpf: employee.cpf || '',
            role: employee.role || '',
            phone: employee.phone || '',
            admissionDate: employee.admissionDate
                ? employee.admissionDate.slice(0, 10)
                : '',
            notes: employee.notes || '',
            salary: employee.salary || '',
            advanceValue: employee.advanceValue || '',
            advanceDay: employee.advanceDay?.toString() || '',
            paymentValue: employee.paymentValue || '',
            paymentDay: employee.paymentDay?.toString() || '',
            vtValue: employee.vtValue || '',
            bonusValue: employee.bonusValue || '',
            bonusDay: employee.bonusDay?.toString() || '',
            paymentMethod: employee.paymentMethod || 'PIX',
            pixKey: employee.pixKey || '',
            pixKeyType: employee.pixKeyType || 'CPF',
        });
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!form.name.trim()) {
            toast.error('Informe o nome do funcionário.');
            return;
        }

        const storeId = getActiveStore()?.id;

        if (!storeId) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            cpf: form.cpf.trim() || undefined,
            role: form.role.trim() || undefined,
            phone: form.phone.trim() || undefined,
            admissionDate: form.admissionDate || undefined,
            notes: form.notes.trim() || undefined,
            salary: form.salary ? Number(form.salary) : undefined,
            advanceValue: form.advanceValue
                ? Number(form.advanceValue)
                : undefined,
            advanceDay: form.advanceDay
                ? Number(form.advanceDay)
                : undefined,
            paymentValue: form.paymentValue
                ? Number(form.paymentValue)
                : undefined,
            paymentDay: form.paymentDay
                ? Number(form.paymentDay)
                : undefined,
            vtValue: form.vtValue ? Number(form.vtValue) : undefined,
            bonusValue: form.bonusValue
                ? Number(form.bonusValue)
                : undefined,
            bonusDay: form.bonusDay ? Number(form.bonusDay) : undefined,
            paymentMethod: form.paymentMethod,
            pixKey:
                form.paymentMethod === 'PIX'
                    ? form.pixKey.trim() || undefined
                    : undefined,
            pixKeyType:
                form.paymentMethod === 'PIX' && form.pixKey.trim()
                    ? form.pixKeyType
                    : undefined,
            storeId,
        };

        try {
            setSaving(true);

            if (editingEmployee) {
                await api.put(`/employees/${editingEmployee.id}`, payload);
                toast.success('Funcionário atualizado.');
            } else {
                await api.post('/employees', payload);
                toast.success('Funcionário cadastrado.');
            }

            resetForm();
            await loadEmployees();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao salvar funcionário.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSaving(false);
        }
    }

    async function handleRemove(employee: Employee) {
        const confirmed = confirm(
            `Desativar o funcionário "${employee.name}"? O histórico de pagamentos é mantido.`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/employees/${employee.id}`);
            toast.success('Funcionário desativado.');
            await loadEmployees();
        } catch {
            toast.error('Erro ao desativar funcionário.');
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Users className="text-zinc-500" />
                    <div>
                        <h2 className="text-lg font-bold">Funcionários</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {employees.length} funcionário(s) ativo(s)
                        </p>
                    </div>
                </div>

                <button
                    onClick={startCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600"
                >
                    <Plus size={16} />
                    Novo funcionário
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="mb-4">
                        <h3 className="text-base font-bold">
                            {editingEmployee
                                ? 'Editar funcionário'
                                : 'Novo funcionário'}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Os valores de adiantamento, pagamento, vale
                            transporte e premiação viram lançamentos
                            automáticos na aba Pagamentos.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                Nome
                            </label>
                            <input
                                value={form.name}
                                onChange={(e) =>
                                    setForm({ ...form, name: e.target.value })
                                }
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                CPF
                            </label>
                            <input
                                value={form.cpf}
                                onChange={(e) =>
                                    setForm({ ...form, cpf: e.target.value })
                                }
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                Cargo
                            </label>
                            <input
                                value={form.role}
                                onChange={(e) =>
                                    setForm({ ...form, role: e.target.value })
                                }
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                Telefone
                            </label>
                            <input
                                value={form.phone}
                                onChange={(e) =>
                                    setForm({ ...form, phone: e.target.value })
                                }
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                Admissão
                            </label>
                            <input
                                type="date"
                                value={form.admissionDate}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        admissionDate: e.target.value,
                                    })
                                }
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                Salário (informativo)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.salary}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        salary: e.target.value,
                                    })
                                }
                                placeholder="0,00"
                                className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                        <p className="mb-3 text-sm font-semibold">
                            Recorrência de pagamentos
                        </p>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Adiantamento (valor)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.advanceValue}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            advanceValue: e.target.value,
                                        })
                                    }
                                    placeholder="0,00"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Adiantamento (dia do mês)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={form.advanceDay}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            advanceDay: e.target.value,
                                        })
                                    }
                                    placeholder="Ex: 20"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Pagamento (valor)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.paymentValue}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            paymentValue: e.target.value,
                                        })
                                    }
                                    placeholder="0,00"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Pagamento (dia do mês)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={form.paymentDay}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            paymentDay: e.target.value,
                                        })
                                    }
                                    placeholder="Ex: 05"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Vale transporte (valor da passagem)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.vtValue}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            vtValue: e.target.value,
                                        })
                                    }
                                    placeholder="0,00"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                                <p className="mt-1 text-xs text-zinc-500">
                                    Total por dia = valor x 2 (ida e volta).
                                    Não gera mais lançamento diário — o
                                    período inteiro é somado e pago junto
                                    com o Pagamento (dia seguinte ao
                                    Pagamento até o Pagamento do mês
                                    seguinte).
                                </p>
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Premiação (valor)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.bonusValue}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            bonusValue: e.target.value,
                                        })
                                    }
                                    placeholder="0,00"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Premiação (dia do mês)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={form.bonusDay}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            bonusDay: e.target.value,
                                        })
                                    }
                                    placeholder="Opcional"
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
                        <p className="mb-3 text-sm font-semibold">
                            Forma de pagamento
                        </p>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                                <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                    Método
                                </label>
                                <select
                                    value={form.paymentMethod}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            paymentMethod: e.target.value,
                                        })
                                    }
                                    className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                >
                                    {Object.entries(
                                        PAYMENT_METHOD_LABELS,
                                    ).map(([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {form.paymentMethod === 'PIX' && (
                                <>
                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                            Tipo de chave
                                        </label>
                                        <select
                                            value={form.pixKeyType}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    pixKeyType:
                                                        e.target.value,
                                                })
                                            }
                                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                        >
                                            {Object.entries(
                                                PIX_KEY_TYPE_LABELS,
                                            ).map(([key, label]) => (
                                                <option key={key} value={key}>
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                                            Chave Pix
                                        </label>
                                        <input
                                            value={form.pixKey}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    pixKey: e.target.value,
                                                })
                                            }
                                            placeholder="CPF, e-mail, telefone ou chave aleatória"
                                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm outline-none focus:border-green-500"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="mb-1 block text-xs text-zinc-600 dark:text-zinc-400">
                            Observações (opcional)
                        </label>
                        <input
                            value={form.notes}
                            onChange={(e) =>
                                setForm({ ...form, notes: e.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    </div>

                    <div className="mt-5 flex gap-3">
                        <button
                            disabled={saving}
                            className="h-11 rounded-xl bg-green-500 px-5 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {saving
                                ? 'Salvando...'
                                : editingEmployee
                                    ? 'Salvar alterações'
                                    : 'Cadastrar funcionário'}
                        </button>

                        <button
                            type="button"
                            onClick={resetForm}
                            className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : employees.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhum funcionário cadastrado.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                                    <th className="py-2 pr-4">Funcionário</th>
                                    <th className="py-2 pr-4">Cargo</th>
                                    <th className="py-2 pr-4">Salário</th>
                                    <th className="py-2 pr-4">
                                        Adiantamento
                                    </th>
                                    <th className="py-2 pr-4">Pagamento</th>
                                    <th className="py-2 pr-4">
                                        Vale transporte
                                    </th>
                                    <th className="py-2 pr-4">Premiação</th>
                                    <th className="py-2 pr-4">
                                        Pagamento (chave)
                                    </th>
                                    <th className="py-2 pr-4 text-right">
                                        Ações
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((employee) => (
                                    <tr
                                        key={employee.id}
                                        className="border-b border-zinc-100 dark:border-zinc-900 align-top"
                                    >
                                        <td className="py-3 pr-4">
                                            <p className="font-semibold">
                                                {employee.name}
                                            </p>
                                            {employee.phone && (
                                                <p className="text-xs text-zinc-500">
                                                    {employee.phone}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                                            {employee.role || '—'}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {formatCurrency(employee.salary)}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {employee.advanceValue ? (
                                                <>
                                                    <p>
                                                        {formatCurrency(
                                                            employee.advanceValue,
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        todo dia{' '}
                                                        {employee.advanceDay}
                                                    </p>
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {employee.paymentValue ? (
                                                <>
                                                    <p>
                                                        {formatCurrency(
                                                            employee.paymentValue,
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        todo dia{' '}
                                                        {employee.paymentDay}
                                                    </p>
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {employee.vtValue ? (
                                                <>
                                                    <p>
                                                        {formatCurrency(
                                                            Number(
                                                                employee.vtValue,
                                                            ) * 2,
                                                        )}
                                                        /dia
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        somado ao Pagamento
                                                    </p>
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            {employee.bonusValue ? (
                                                <>
                                                    <p>
                                                        {formatCurrency(
                                                            employee.bonusValue,
                                                        )}
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        {employee.bonusDay
                                                            ? `todo dia ${employee.bonusDay}`
                                                            : 'sem dia fixo'}
                                                    </p>
                                                </>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <p>
                                                {PAYMENT_METHOD_LABELS[
                                                    employee.paymentMethod ||
                                                    'PIX'
                                                ] || employee.paymentMethod}
                                            </p>
                                            {employee.pixKey && (
                                                <p className="text-xs text-zinc-500">
                                                    {employee.pixKeyType
                                                        ? PIX_KEY_TYPE_LABELS[
                                                        employee.pixKeyType
                                                        ] ||
                                                        employee.pixKeyType
                                                        : 'Chave'}
                                                    : {employee.pixKey}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-3 pr-4">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() =>
                                                        startEdit(employee)
                                                    }
                                                    title="Editar"
                                                    className="rounded-xl border border-zinc-300 dark:border-zinc-700 p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                >
                                                    <Pencil size={14} />
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        handleRemove(employee)
                                                    }
                                                    title="Desativar"
                                                    className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
