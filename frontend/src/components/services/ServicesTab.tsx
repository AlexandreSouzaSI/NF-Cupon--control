'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Briefcase,
    CheckCircle2,
    Plus,
    Search,
    Trash2,
    Upload,
} from 'lucide-react';
import { toast } from 'sonner';

type Service = {
    id: string;
    name: string;
    providerName: string;
    description?: string | null;
    value: string;
    serviceDate: string;
    notes?: string | null;
    nfFileUrl?: string | null;
    nfOriginalName?: string | null;
    paymentMethod?: string | null;
    pixKey?: string | null;
    pixKeyType?: string | null;
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

function formatCurrency(value: string | number) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value: string) {
    return new Date(value).toLocaleDateString('pt-BR', {
        timeZone: 'UTC',
    });
}

function getWeekRange(reference = new Date()) {
    const date = new Date(reference);
    const day = date.getDay(); // 0 = domingo
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const start = new Date(date);
    start.setDate(date.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

function getMonthRange(reference = new Date()) {
    const start = new Date(
        reference.getFullYear(),
        reference.getMonth(),
        1,
        0,
        0,
        0,
        0,
    );
    const end = new Date(
        reference.getFullYear(),
        reference.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
    );

    return { start, end };
}

export function ServicesTab() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const [nameFilter, setNameFilter] = useState('');
    const [monthFilter, setMonthFilter] = useState('');

    const [name, setName] = useState('');
    const [providerName, setProviderName] = useState('');
    const [description, setDescription] = useState('');
    const [value, setValue] = useState('');
    const [serviceDate, setServiceDate] = useState('');
    const [notes, setNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('PIX');
    const [pixKey, setPixKey] = useState('');
    const [pixKeyType, setPixKeyType] = useState('CPF');

    async function loadServices() {
        try {
            setLoading(true);

            const response = await api.get('/services', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setServices(response.data || []);
        } catch {
            toast.error('Erro ao carregar serviços.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadServices();
    }, []);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();

        if (!name.trim() || !providerName.trim()) {
            toast.error('Informe o nome do serviço e o prestador.');
            return;
        }

        if (!value || Number(value) <= 0) {
            toast.error('Informe um valor válido.');
            return;
        }

        if (!serviceDate) {
            toast.error('Informe a data do serviço.');
            return;
        }

        const storeId = getActiveStore()?.id;

        if (!storeId) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setCreating(true);

            await api.post('/services', {
                name: name.trim(),
                providerName: providerName.trim(),
                description: description.trim() || undefined,
                value: Number(value),
                serviceDate,
                notes: notes.trim() || undefined,
                paymentMethod,
                pixKey:
                    paymentMethod === 'PIX'
                        ? pixKey.trim() || undefined
                        : undefined,
                pixKeyType:
                    paymentMethod === 'PIX' && pixKey.trim()
                        ? pixKeyType
                        : undefined,
                storeId,
            });

            toast.success('Serviço cadastrado.');

            setName('');
            setProviderName('');
            setDescription('');
            setValue('');
            setServiceDate('');
            setNotes('');
            setPaymentMethod('PIX');
            setPixKey('');
            setPixKeyType('CPF');

            await loadServices();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao cadastrar serviço.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setCreating(false);
        }
    }

    async function handleUploadNf(service: Service, file: File) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post(
                `/services/${service.id}/nf/upload`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                },
            );

            toast.success('NF anexada.');
            await loadServices();
        } catch {
            toast.error('Erro ao anexar NF.');
        }
    }

    async function handleRemove(service: Service) {
        const confirmed = confirm(
            `Excluir o serviço "${service.name}"?`,
        );

        if (!confirmed) return;

        try {
            await api.delete(`/services/${service.id}`);
            toast.success('Serviço excluído.');
            await loadServices();
        } catch {
            toast.error(
                'Erro ao excluir serviço. Verifique seu perfil de acesso.',
            );
        }
    }

    const { weekCount, weekTotal, monthCount, monthTotal } =
        useMemo(() => {
            const { start: weekStart, end: weekEnd } = getWeekRange();
            const { start: monthStart, end: monthEnd } =
                getMonthRange();

            let wCount = 0;
            let wTotal = 0;
            let mCount = 0;
            let mTotal = 0;

            for (const service of services) {
                const date = new Date(service.serviceDate);
                const numValue = Number(service.value);

                if (date >= weekStart && date <= weekEnd) {
                    wCount += 1;
                    wTotal += numValue;
                }

                if (date >= monthStart && date <= monthEnd) {
                    mCount += 1;
                    mTotal += numValue;
                }
            }

            return {
                weekCount: wCount,
                weekTotal: wTotal,
                monthCount: mCount,
                monthTotal: mTotal,
            };
        }, [services]);

    const visibleServices = useMemo(() => {
        return services.filter((service) => {
            if (nameFilter.trim()) {
                const search = nameFilter.trim().toLowerCase();
                const matches =
                    service.name.toLowerCase().includes(search) ||
                    service.providerName.toLowerCase().includes(search);

                if (!matches) return false;
            }

            if (monthFilter) {
                const serviceMonth = service.serviceDate.slice(0, 7);
                if (serviceMonth !== monthFilter) return false;
            }

            return true;
        });
    }, [services, nameFilter, monthFilter]);

    return (
        <div className="space-y-5">
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Serviços da semana
                    </p>
                    <p className="mt-2 text-3xl font-bold">{weekCount}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        {formatCurrency(weekTotal)}
                    </p>
                </div>

                <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Serviços do mês corrente
                    </p>
                    <p className="mt-2 text-3xl font-bold">{monthCount}</p>
                    <p className="mt-1 text-sm text-zinc-500">
                        {formatCurrency(monthTotal)}
                    </p>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[420px_1fr]">
                <form
                    onSubmit={handleCreate}
                    className="h-fit rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
                >
                    <div className="mb-5 flex items-center gap-3">
                        <div className="rounded-2xl bg-green-500/10 p-3 text-green-400">
                            <Plus size={22} />
                        </div>

                        <div>
                            <h2 className="text-lg font-bold">
                                Novo serviço
                            </h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                Cadastre o serviço prestado e anexe a NF
                                quando ela chegar.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Nome do serviço
                            </label>
                            <input
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex: Manutenção do ar condicionado"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Prestador
                            </label>
                            <input
                                value={providerName}
                                onChange={(e) =>
                                    setProviderName(e.target.value)
                                }
                                placeholder="Ex: João Manutenções"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Valor
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={value}
                                    onChange={(e) =>
                                        setValue(e.target.value)
                                    }
                                    placeholder="0,00"
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Data
                                </label>
                                <input
                                    type="date"
                                    value={serviceDate}
                                    onChange={(e) =>
                                        setServiceDate(e.target.value)
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Descrição (opcional)
                            </label>
                            <input
                                value={description}
                                onChange={(e) =>
                                    setDescription(e.target.value)
                                }
                                placeholder="Detalhes do serviço"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                Observações (opcional)
                            </label>
                            <input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Observações internas"
                                className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Forma de pagamento
                                </label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) =>
                                        setPaymentMethod(e.target.value)
                                    }
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
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

                            {paymentMethod === 'PIX' && (
                                <div>
                                    <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                        Tipo de chave
                                    </label>
                                    <select
                                        value={pixKeyType}
                                        onChange={(e) =>
                                            setPixKeyType(e.target.value)
                                        }
                                        className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
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
                            )}
                        </div>

                        {paymentMethod === 'PIX' && (
                            <div>
                                <label className="mb-2 block text-sm text-zinc-700 dark:text-zinc-300">
                                    Chave Pix (opcional)
                                </label>
                                <input
                                    value={pixKey}
                                    onChange={(e) =>
                                        setPixKey(e.target.value)
                                    }
                                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                                    className="h-12 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-4 outline-none focus:border-green-500"
                                />
                            </div>
                        )}

                        <button
                            disabled={creating}
                            className="h-12 w-full rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                        >
                            {creating ? 'Salvando...' : 'Cadastrar serviço'}
                        </button>
                    </div>
                </form>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <Briefcase className="text-zinc-500" />
                            <div>
                                <h2 className="text-lg font-bold">
                                    Serviços cadastrados
                                </h2>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    {visibleServices.length} serviço(s)
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative">
                                <Search
                                    size={16}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                                />
                                <input
                                    value={nameFilter}
                                    onChange={(e) =>
                                        setNameFilter(e.target.value)
                                    }
                                    placeholder="Nome ou prestador"
                                    className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 pl-9 pr-3 text-sm outline-none focus:border-green-500 sm:w-52"
                                />
                            </div>

                            <input
                                type="month"
                                value={monthFilter}
                                onChange={(e) =>
                                    setMonthFilter(e.target.value)
                                }
                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Carregando...
                        </p>
                    ) : visibleServices.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhum serviço encontrado.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {visibleServices.map((service) => (
                                <div
                                    key={service.id}
                                    className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                                >
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <p className="font-semibold">
                                                {service.name}
                                            </p>

                                            <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                                {service.providerName} •{' '}
                                                {formatDate(
                                                    service.serviceDate,
                                                )}
                                            </p>

                                            {service.description && (
                                                <p className="mt-1 text-sm text-zinc-500">
                                                    {service.description}
                                                </p>
                                            )}

                                            {service.paymentMethod && (
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    Pagamento:{' '}
                                                    {PAYMENT_METHOD_LABELS[
                                                        service.paymentMethod
                                                    ] || service.paymentMethod}
                                                    {service.pixKey &&
                                                        ` • ${service.pixKeyType
                                                            ? PIX_KEY_TYPE_LABELS[
                                                            service.pixKeyType
                                                            ] ||
                                                            service.pixKeyType
                                                            : 'Chave'
                                                        }: ${service.pixKey}`}
                                                </p>
                                            )}

                                            <p className="mt-2 text-lg font-bold text-orange-400">
                                                {formatCurrency(
                                                    service.value,
                                                )}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {service.nfFileUrl ? (
                                                <a
                                                    href={`${API_URL}${service.nfFileUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    NF anexada
                                                </a>
                                            ) : (
                                                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-green-500 px-4 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600">
                                                    <Upload size={16} />
                                                    Anexar NF
                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf,.xml"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file =
                                                                e.target
                                                                    .files?.[0];

                                                            if (file) {
                                                                handleUploadNf(
                                                                    service,
                                                                    file,
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            )}

                                            <button
                                                onClick={() =>
                                                    handleRemove(service)
                                                }
                                                title="Excluir serviço"
                                                className="rounded-xl border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:bg-red-500/20"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
