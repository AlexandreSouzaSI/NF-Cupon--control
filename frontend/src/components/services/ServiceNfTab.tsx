'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    CheckCircle2,
    Download,
    FileText,
    Link2,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

type Service = {
    id: string;
    name: string;
    providerName: string;
    value: string;
    serviceDate: string;
    nfFileUrl?: string | null;
    nfOriginalName?: string | null;
};

type IncomingNf = {
    id: string;
    chaveAcesso: string;
    tipoDocumento: string;
    generatedAt?: string | null;
    fetchedAt: string;
    fileUrl?: string | null;
};

type FilterMode = 'MONTH' | 'RANGE';

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

function currentMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
}

export function ServiceNfTab() {
    const [allServices, setAllServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    const [incomingNfs, setIncomingNfs] = useState<IncomingNf[]>([]);
    const [loadingIncoming, setLoadingIncoming] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [selectedService, setSelectedService] = useState<
        Record<string, string>
    >({});
    const [reconcilingId, setReconcilingId] = useState<string | null>(
        null,
    );

    const [mode, setMode] = useState<FilterMode>('MONTH');
    const [month, setMonth] = useState(currentMonth());
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const services = useMemo(
        () => allServices.filter((service) => service.nfFileUrl),
        [allServices],
    );

    const servicesWithoutNf = useMemo(
        () => allServices.filter((service) => !service.nfFileUrl),
        [allServices],
    );

    async function loadServices() {
        try {
            setLoading(true);

            const response = await api.get('/services', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setAllServices(response.data || []);
        } catch {
            toast.error('Erro ao carregar NFs de serviços.');
        } finally {
            setLoading(false);
        }
    }

    async function loadIncomingNfs() {
        try {
            setLoadingIncoming(true);

            const response = await api.get('/services/incoming-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setIncomingNfs(response.data || []);
        } catch {
            toast.error('Erro ao carregar NFs pendentes de conciliação.');
        } finally {
            setLoadingIncoming(false);
        }
    }

    async function handleSyncSefaz() {
        const storeId = getActiveStore()?.id;

        if (!storeId) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setSyncing(true);

            const response = await api.post(
                '/services/sync-sefaz',
                undefined,
                { params: { storeId } },
            );

            const { fetchedTotal, nfseCount } = response.data as {
                fetchedTotal: number;
                nfseCount: number;
            };

            if (fetchedTotal === 0) {
                toast.success('Nenhuma NF nova encontrada na Sefaz.');
            } else {
                toast.success(
                    `${fetchedTotal} documento(s) novo(s) encontrado(s) (${nfseCount} NF de serviço). Concilie abaixo.`,
                );
            }

            await loadIncomingNfs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao buscar NFs na Sefaz.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setSyncing(false);
        }
    }

    async function handleReconcile(incoming: IncomingNf) {
        const serviceId = selectedService[incoming.id];

        if (!serviceId) {
            toast.error('Selecione a qual serviço essa NF pertence.');
            return;
        }

        try {
            setReconcilingId(incoming.id);

            await api.post(
                `/services/incoming-nf/${incoming.id}/reconcile`,
                { serviceId },
            );

            toast.success('NF vinculada ao serviço.');

            await Promise.all([loadServices(), loadIncomingNfs()]);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao vincular a NF ao serviço.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setReconcilingId(null);
        }
    }

    useEffect(() => {
        loadServices();
        loadIncomingNfs();
    }, []);

    const filteredServices = useMemo(() => {
        return services.filter((service) => {
            if (mode === 'MONTH') {
                if (!month) return true;
                return service.serviceDate.slice(0, 7) === month;
            }

            const date = new Date(service.serviceDate);

            if (startDate && date < new Date(`${startDate}T00:00:00`)) {
                return false;
            }

            if (endDate && date > new Date(`${endDate}T23:59:59`)) {
                return false;
            }

            return true;
        });
    }, [services, mode, month, startDate, endDate]);

    const total = useMemo(
        () =>
            filteredServices.reduce(
                (sum, service) => sum + Number(service.value),
                0,
            ),
        [filteredServices],
    );

    async function handleDownload() {
        if (filteredServices.length === 0) {
            toast.error('Nenhuma NF encontrada nesse período.');
            return;
        }

        try {
            setDownloading(true);

            const params: Record<string, string> = {
                storeId: getActiveStore()?.id || '',
            };

            if (mode === 'MONTH') {
                params.month = month;
            } else {
                if (startDate) params.startDate = startDate;
                if (endDate) params.endDate = endDate;
            }

            const response = await api.get('/services/download/zip', {
                params,
                responseType: 'blob',
            });

            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data]),
            );

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download =
                mode === 'MONTH'
                    ? `nf-servicos-${month}.zip`
                    : `nf-servicos-${startDate || 'inicio'}-a-${endDate || 'fim'
                    }.zip`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch {
            toast.error('Erro ao gerar o arquivo com as NFs.');
        } finally {
            setDownloading(false);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Buscar NFs na Sefaz
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Busca as NFs de serviço emitidas contra o CNPJ
                            da loja ativa e deixa prontas pra conciliar
                            abaixo.
                        </p>
                    </div>

                    <button
                        onClick={handleSyncSefaz}
                        disabled={syncing}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                        {syncing ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <RefreshCw size={18} />
                        )}
                        Buscar NFs da Sefaz
                    </button>
                </div>

                {loadingIncoming ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando pendências...
                    </p>
                ) : incomingNfs.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        Nenhuma NF pendente de conciliação no momento.
                    </p>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-yellow-500">
                            {incomingNfs.length} NF(s) aguardando
                            conciliação
                        </p>

                        {incomingNfs.map((incoming) => (
                            <div
                                key={incoming.id}
                                className="flex flex-col gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-mono text-xs text-zinc-500">
                                        {incoming.chaveAcesso}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {incoming.generatedAt
                                            ? formatDate(
                                                incoming.generatedAt,
                                            )
                                            : 'Data não informada'}
                                    </p>

                                    {incoming.fileUrl && (
                                        <a
                                            href={`${API_URL}${incoming.fileUrl}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-1 inline-block text-sm text-blue-500 hover:underline"
                                        >
                                            Ver XML
                                        </a>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <select
                                        value={
                                            selectedService[incoming.id] ||
                                            ''
                                        }
                                        onChange={(e) =>
                                            setSelectedService({
                                                ...selectedService,
                                                [incoming.id]:
                                                    e.target.value,
                                            })
                                        }
                                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500 sm:w-64"
                                    >
                                        <option value="">
                                            Selecione o serviço
                                        </option>

                                        {servicesWithoutNf.map((service) => (
                                            <option
                                                key={service.id}
                                                value={service.id}
                                            >
                                                {service.name} —{' '}
                                                {service.providerName} —{' '}
                                                {formatCurrency(
                                                    service.value,
                                                )}
                                            </option>
                                        ))}
                                    </select>

                                    <button
                                        disabled={
                                            reconcilingId === incoming.id
                                        }
                                        onClick={() =>
                                            handleReconcile(incoming)
                                        }
                                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                                    >
                                        <Link2 size={16} />
                                        Vincular
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            NF de serviços
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {filteredServices.length} NF(s) •{' '}
                            {formatCurrency(total)}
                        </p>
                    </div>

                    <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {downloading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Download size={18} />
                        )}
                        Baixar NFs (.zip)
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex rounded-xl border border-zinc-300 dark:border-zinc-700 p-1">
                        <button
                            onClick={() => setMode('MONTH')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'MONTH'
                                ? 'bg-green-500 text-zinc-900 dark:text-white'
                                : 'text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            Por mês
                        </button>
                        <button
                            onClick={() => setMode('RANGE')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'RANGE'
                                ? 'bg-green-500 text-zinc-900 dark:text-white'
                                : 'text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            Por período
                        </button>
                    </div>

                    {mode === 'MONTH' ? (
                        <input
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    ) : (
                        <>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) =>
                                    setStartDate(e.target.value)
                                }
                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                            <span className="text-sm text-zinc-500">
                                até
                            </span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) =>
                                    setEndDate(e.target.value)
                                }
                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                            />
                        </>
                    )}
                </div>
            </section>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : filteredServices.length === 0 ? (
                    <div className="py-8 text-center">
                        <FileText className="mx-auto mb-3 text-zinc-500" />
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Nenhuma NF de serviço nesse período.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredServices.map((service) => (
                            <div
                                key={service.id}
                                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {service.name}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {service.providerName} •{' '}
                                        {formatDate(service.serviceDate)}{' '}
                                        • {formatCurrency(service.value)}
                                    </p>
                                </div>

                                <a
                                    href={`${API_URL}${service.nfFileUrl}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20"
                                >
                                    <CheckCircle2 size={16} />
                                    Abrir NF
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
