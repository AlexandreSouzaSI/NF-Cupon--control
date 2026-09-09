'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { Pagination } from '../ui/Pagination';
import {
    AcceptNfBillForm,
    AcceptNfBillPayload,
} from '../ui/AcceptNfBillForm';
import { NfViewerModal } from '../ui/NfViewerModal';
import {
    CheckCircle2,
    Download,
    Eye,
    FileText,
    Link2,
    Loader2,
    RefreshCw,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

type Service = {
    id: string;
    name: string;
    providerName: string;
    value: string;
    serviceDate: string;
    nfFileUrl?: string | null;
    nfOriginalName?: string | null;
};

type ConfirmedNf = {
    id: string;
    source: 'service' | 'incoming';
    fileUrl: string;
    originalName?: string | null;
    date: string;
    providerName: string;
    value?: string | null;
};

type IncomingNf = {
    id: string;
    chaveAcesso: string;
    tipoDocumento: string;
    generatedAt?: string | null;
    fetchedAt: string;
    fileUrl?: string | null;
    numeroNf?: string | null;
    issuerName?: string | null;
    issuerDoc?: string | null;
    value?: string | null;
    issueDate?: string | null;
    serviceId?: string | null;
    billId?: string | null;
    accepted?: boolean;
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
    const [confirmedNfs, setConfirmedNfs] = useState<ConfirmedNf[]>([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    const [incomingNfs, setIncomingNfs] = useState<IncomingNf[]>([]);
    const [incomingTotal, setIncomingTotal] = useState(0);
    const [incomingPage, setIncomingPage] = useState(1);
    const [loadingIncoming, setLoadingIncoming] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showAccepted, setShowAccepted] = useState(false);
    const [selectedService, setSelectedService] = useState<
        Record<string, string>
    >({});
    const [reconcilingId, setReconcilingId] = useState<string | null>(
        null,
    );
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [viewingIncomingId, setViewingIncomingId] = useState<string | null>(
        null,
    );
    const [viewingServiceId, setViewingServiceId] = useState<string | null>(
        null,
    );

    const [mode, setMode] = useState<FilterMode>('MONTH');
    const [month, setMonth] = useState(currentMonth());
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [confirmedPage, setConfirmedPage] = useState(1);

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

    async function loadConfirmedNfs() {
        try {
            setLoading(true);

            const response = await api.get('/services/confirmed-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                },
            });

            setConfirmedNfs(response.data || []);
        } catch {
            toast.error('Erro ao carregar NFs de serviços confirmadas.');
        } finally {
            setLoading(false);
        }
    }

    async function loadIncomingNfs(page = incomingPage) {
        try {
            setLoadingIncoming(true);

            const response = await api.get('/services/incoming-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    page,
                    pageSize: PAGE_SIZE,
                    accepted: showAccepted,
                },
            });

            const result = response.data as {
                items: IncomingNf[];
                total: number;
            };

            setIncomingNfs(result.items || []);
            setIncomingTotal(result.total || 0);
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

            if (incomingPage === 1) {
                await loadIncomingNfs(1);
            } else {
                setIncomingPage(1);
            }
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
            setLinkingId(null);

            // Se essa era a última NF pendente da página, volta pra página
            // anterior em vez de mostrar uma página vazia (a mudança de
            // página já dispara a recarga da lista pendente sozinha).
            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
                await loadServices();
            } else {
                await Promise.all([
                    loadServices(),
                    loadIncomingNfs(incomingPage),
                ]);
            }

            await loadConfirmedNfs();
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

    async function handleIgnore(incomingId: string) {
        const confirmed = confirm('Recusar essa NF de serviço?');
        if (!confirmed) return;

        try {
            setBusyId(incomingId);

            await api.post(`/services/incoming-nf/${incomingId}/ignore`);

            toast.success('NF recusada.');

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao recusar a NF.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setBusyId(null);
        }
    }

    async function handleAcceptWithoutBill(incomingId: string) {
        const confirmed = confirm(
            'Aceitar essa NF sem gerar conta a pagar?',
        );
        if (!confirmed) return;

        try {
            setBusyId(incomingId);

            await api.post(`/services/incoming-nf/${incomingId}/accept`, {
                generateBill: false,
            });

            toast.success('NF aceita.');

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }

            await loadConfirmedNfs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao aceitar a NF.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setBusyId(null);
        }
    }

    async function handleAcceptWithBill(
        incomingId: string,
        payload: AcceptNfBillPayload,
    ) {
        try {
            setBusyId(incomingId);

            await api.post(`/services/incoming-nf/${incomingId}/accept`, {
                generateBill: true,
                supplierName: payload.supplierName,
                categoryName: payload.categoryName,
                dueDate: payload.dueDate,
                pixKey: payload.pixKey,
                barcode: payload.barcode,
            });

            toast.success('NF aceita e conta a pagar criada.');
            setAcceptingId(null);

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }

            await loadConfirmedNfs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao gerar a conta a pagar.';

            toast.error(
                Array.isArray(message) ? message.join(', ') : message,
            );
        } finally {
            setBusyId(null);
        }
    }

    useEffect(() => {
        loadServices();
        loadConfirmedNfs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadIncomingNfs(incomingPage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [incomingPage, showAccepted]);

    function handleToggleAccepted(checked: boolean) {
        setShowAccepted(checked);
        setIncomingPage(1);
    }

    useEffect(() => {
        setConfirmedPage(1);
    }, [mode, month, startDate, endDate]);

    const filteredServices = useMemo(() => {
        return confirmedNfs.filter((item) => {
            if (mode === 'MONTH') {
                if (!month) return true;
                return item.date.slice(0, 7) === month;
            }

            const date = new Date(item.date);

            if (startDate && date < new Date(`${startDate}T00:00:00`)) {
                return false;
            }

            if (endDate && date > new Date(`${endDate}T23:59:59`)) {
                return false;
            }

            return true;
        });
    }, [confirmedNfs, mode, month, startDate, endDate]);

    const total = useMemo(
        () =>
            filteredServices.reduce(
                (sum, item) => sum + Number(item.value || 0),
                0,
            ),
        [filteredServices],
    );

    const confirmedTotalPages = Math.max(
        1,
        Math.ceil(filteredServices.length / PAGE_SIZE),
    );

    const paginatedServices = useMemo(
        () =>
            filteredServices.slice(
                (confirmedPage - 1) * PAGE_SIZE,
                confirmedPage * PAGE_SIZE,
            ),
        [filteredServices, confirmedPage],
    );

    const incomingTotalPages = Math.max(
        1,
        Math.ceil(incomingTotal / PAGE_SIZE),
    );

    async function handleDownload() {
        // Não bloqueia mais com base em filteredServices (que só reflete
        // as NFs já aceitas) — o zip do backend inclui todas as NFs do
        // período, vinculadas ou não, então o backend é quem decide se
        // tem algo pra baixar.
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
        } catch (error: any) {
            // responseType: 'blob' faz o corpo de erro do backend chegar
            // como Blob em vez de JSON já parseado — sem isso, o toast
            // sempre mostrava um texto genérico e escondia o motivo real.
            let message = 'Erro ao gerar o arquivo com as NFs.';

            const data = error?.response?.data;

            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    const parsed = JSON.parse(text);
                    message = Array.isArray(parsed?.message)
                        ? parsed.message.join(', ')
                        : parsed?.message || message;
                } catch {
                    // corpo não é JSON — mantém a mensagem genérica
                }
            } else if (data?.message) {
                message = Array.isArray(data.message)
                    ? data.message.join(', ')
                    : data.message;
            }

            toast.error(message);
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
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                            Evite clicar várias vezes seguidas: a Sefaz
                            bloqueia o CNPJ por 1 hora se detectar consultas
                            repetidas — e como a contabilidade/Omie também
                            consulta esse CNPJ, um clique aqui pode
                            atrapalhar a busca automática deles também.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-zinc-300 dark:border-zinc-700 px-4 text-sm font-medium">
                            <input
                                type="checkbox"
                                checked={showAccepted}
                                onChange={(e) =>
                                    handleToggleAccepted(e.target.checked)
                                }
                                className="h-4 w-4 accent-emerald-500"
                            />
                            NFs Aceitas
                        </label>

                        <button
                            onClick={handleSyncSefaz}
                            disabled={syncing}
                            className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-500 px-5 font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                            {syncing ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <RefreshCw size={18} />
                            )}
                            Buscar NFs da Sefaz
                        </button>
                    </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
                    <p className="w-full text-sm font-semibold sm:w-auto">
                        Baixar NFs do período
                    </p>

                    <div
                        data-tour="servico-download-mode"
                        className="flex rounded-xl border border-zinc-300 dark:border-zinc-700 p-1"
                    >
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
                            data-tour="servico-download-period"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                        />
                    ) : (
                        <div
                            data-tour="servico-download-period"
                            className="flex items-center gap-2"
                        >
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
                        </div>
                    )}

                    <button
                        data-tour="servico-download-button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-green-600 disabled:opacity-50"
                    >
                        {downloading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Download size={16} />
                        )}
                        Baixar todas as NFs (.zip)
                    </button>
                </div>

                {loadingIncoming ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : incomingNfs.length === 0 ? (
                    <p className="text-sm text-zinc-500">
                        {showAccepted
                            ? 'Nenhuma NF de serviço aceita ainda.'
                            : 'Nenhuma NF pendente de conciliação no momento.'}
                    </p>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-yellow-500">
                            {incomingTotal}{' '}
                            {showAccepted
                                ? 'NF(s) aceita(s)'
                                : 'NF(s) aguardando conciliação'}
                        </p>

                        {incomingNfs.map((incoming) => (
                            <div
                                key={incoming.id}
                                className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-4"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-baseline gap-x-2">
                                            <p className="font-semibold">
                                                {incoming.issuerName ||
                                                    'Prestador não identificado'}
                                            </p>

                                            {incoming.numeroNf && (
                                                <p className="text-sm text-zinc-500">
                                                    NF nº {incoming.numeroNf}
                                                </p>
                                            )}
                                        </div>

                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            {incoming.issueDate ||
                                                incoming.generatedAt
                                                ? formatDate(
                                                    (incoming.issueDate ||
                                                        incoming.generatedAt) as string,
                                                )
                                                : 'Data não informada'}
                                            {incoming.value &&
                                                ` • ${formatCurrency(incoming.value)}`}
                                        </p>

                                        <p className="mt-1 font-mono text-xs text-zinc-400">
                                            {incoming.chaveAcesso}
                                        </p>

                                        <div className="mt-1 flex flex-wrap gap-3">
                                            <button
                                                onClick={() =>
                                                    setViewingIncomingId(
                                                        incoming.id,
                                                    )
                                                }
                                                className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
                                            >
                                                <Eye size={14} />
                                                Visualizar
                                            </button>

                                            {incoming.fileUrl && (
                                                <a
                                                    href={`${API_URL}${incoming.fileUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-block text-sm text-blue-500 hover:underline"
                                                >
                                                    Ver XML
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:min-w-[260px]">
                                        {showAccepted ? (
                                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500">
                                                <CheckCircle2 size={16} />
                                                {incoming.serviceId
                                                    ? 'Vinculada a um serviço'
                                                    : incoming.billId
                                                        ? 'Aceita — conta a pagar criada'
                                                        : 'Aceita sem gerar conta'}
                                            </span>
                                        ) : linkingId === incoming.id ? (
                                            <>
                                                <select
                                                    value={
                                                        selectedService[
                                                        incoming.id
                                                        ] || ''
                                                    }
                                                    onChange={(e) =>
                                                        setSelectedService({
                                                            ...selectedService,
                                                            [incoming.id]:
                                                                e.target.value,
                                                        })
                                                    }
                                                    className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-green-500"
                                                >
                                                    <option value="">
                                                        Selecione o serviço
                                                    </option>

                                                    {servicesWithoutNf.map(
                                                        (service) => (
                                                            <option
                                                                key={service.id}
                                                                value={service.id}
                                                            >
                                                                {service.name} —{' '}
                                                                {service.providerName}{' '}
                                                                —{' '}
                                                                {formatCurrency(
                                                                    service.value,
                                                                )}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>

                                                <div className="flex gap-2">
                                                    <button
                                                        disabled={
                                                            reconcilingId ===
                                                            incoming.id
                                                        }
                                                        onClick={() =>
                                                            handleReconcile(
                                                                incoming,
                                                            )
                                                        }
                                                        className="h-10 flex-1 rounded-xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                                                    >
                                                        <span className="inline-flex items-center justify-center gap-2">
                                                            <Link2 size={16} />
                                                            {reconcilingId ===
                                                                incoming.id
                                                                ? 'Vinculando...'
                                                                : 'Confirmar vínculo'}
                                                        </span>
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            setLinkingId(null)
                                                        }
                                                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : acceptingId === incoming.id ? null : (
                                            <>
                                                <button
                                                    onClick={() =>
                                                        setLinkingId(
                                                            incoming.id,
                                                        )
                                                    }
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 text-sm font-medium text-blue-500 hover:bg-blue-500/20"
                                                >
                                                    <Link2 size={16} />
                                                    Vincular a serviço existente
                                                </button>

                                                <button
                                                    onClick={() =>
                                                        setAcceptingId(
                                                            incoming.id,
                                                        )
                                                    }
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    Aceitar e gerar conta
                                                </button>

                                                <button
                                                    disabled={
                                                        busyId === incoming.id
                                                    }
                                                    onClick={() =>
                                                        handleAcceptWithoutBill(
                                                            incoming.id,
                                                        )
                                                    }
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                                                >
                                                    Aceitar sem gerar conta
                                                </button>

                                                <button
                                                    disabled={
                                                        busyId === incoming.id
                                                    }
                                                    onClick={() =>
                                                        handleIgnore(
                                                            incoming.id,
                                                        )
                                                    }
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                                >
                                                    Recusar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {acceptingId === incoming.id && (
                                    <div className="mt-3">
                                        <AcceptNfBillForm
                                            initialSupplierName={
                                                incoming.issuerName || ''
                                            }
                                            initialValue={incoming.value}
                                            submitting={
                                                busyId === incoming.id
                                            }
                                            onCancel={() =>
                                                setAcceptingId(null)
                                            }
                                            onSubmit={(payload) =>
                                                handleAcceptWithBill(
                                                    incoming.id,
                                                    payload,
                                                )
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        ))}

                        <Pagination
                            page={incomingPage}
                            totalPages={incomingTotalPages}
                            onPageChange={setIncomingPage}
                        />
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4">
                    <h2 className="text-lg font-bold">
                        NF de serviços
                    </h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {filteredServices.length} NF(s) aceita(s) •{' '}
                        {formatCurrency(total)}
                    </p>
                </div>

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
                        {paginatedServices.map((item) => (
                            <div
                                key={`${item.source}-${item.id}`}
                                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-semibold">
                                        {item.providerName}
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        {formatDate(item.date)}
                                        {item.value &&
                                            ` • ${formatCurrency(item.value)}`}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() =>
                                            item.source === 'service'
                                                ? setViewingServiceId(item.id)
                                                : setViewingIncomingId(
                                                    item.id,
                                                )
                                        }
                                        className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-500 hover:bg-blue-500/20"
                                    >
                                        <Eye size={16} />
                                        Visualizar
                                    </button>

                                    <a
                                        href={`${API_URL}${item.fileUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20"
                                    >
                                        <CheckCircle2 size={16} />
                                        Abrir NF
                                    </a>
                                </div>
                            </div>
                        ))}

                        <Pagination
                            page={confirmedPage}
                            totalPages={confirmedTotalPages}
                            onPageChange={setConfirmedPage}
                        />
                    </div>
                )}
            </section>

            {viewingIncomingId && (
                <NfViewerModal
                    title="NF de serviço"
                    viewUrl={`/services/incoming-nf/${viewingIncomingId}/view`}
                    onClose={() => setViewingIncomingId(null)}
                />
            )}

            {viewingServiceId && (
                <NfViewerModal
                    title="NF de serviço"
                    viewUrl={`/services/${viewingServiceId}/view`}
                    onClose={() => setViewingServiceId(null)}
                />
            )}
        </div>
    );
}
