'use client';

import { useEffect, useRef, useState } from 'react';
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
    FileSearch,
    Link2,
    Loader2,
    RefreshCw,
    Upload,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

type IncomingGoodsNf = {
    id: string;
    chaveAcesso: string;
    tipoDocumento: string;
    issuerCnpj?: string | null;
    issuerName?: string | null;
    value?: string | null;
    issueDate?: string | null;
    situacao?: string | null;
    fileUrl?: string | null;
    fetchedAt: string;
    source: 'SEFAZ' | 'XML_UPLOAD';
    manifestedAt?: string | null;
    manifestStatus?: string | null;
    purchaseId?: string | null;
    billId?: string | null;
    accepted?: boolean;
};

type FilterMode = 'MONTH' | 'RANGE';

function currentMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${month}`;
}

type PurchaseOption = {
    id: string;
    description: string;
    value: string;
    status: string;
};

const EXCLUDED_STATUSES = ['DRAFT', 'REJECTED', 'CANCELED'];

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

function formatDate(value?: string | null) {
    if (!value) return 'Data não informada';
    return new Date(value).toLocaleDateString('pt-BR');
}

export function EntradaNfTab() {
    const [incomingNfs, setIncomingNfs] = useState<IncomingGoodsNf[]>([]);
    const [incomingTotal, setIncomingTotal] = useState(0);
    const [incomingPage, setIncomingPage] = useState(1);
    const [loadingIncoming, setLoadingIncoming] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showAccepted, setShowAccepted] = useState(false);

    const [downloading, setDownloading] = useState(false);
    const [mode, setMode] = useState<FilterMode>('MONTH');
    const [month, setMonth] = useState(currentMonth());
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [purchases, setPurchases] = useState<PurchaseOption[]>([]);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [acceptingId, setAcceptingId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [selectedPurchaseId, setSelectedPurchaseId] = useState<
        Record<string, string>
    >({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const [importErrors, setImportErrors] = useState<
        { fileName: string; reason: string }[]
    >([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    async function loadIncomingNfs(page = incomingPage) {
        try {
            setLoadingIncoming(true);

            const response = await api.get('/purchases/incoming-goods-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    page,
                    pageSize: PAGE_SIZE,
                    accepted: showAccepted,
                },
            });

            const result = response.data as {
                items: IncomingGoodsNf[];
                total: number;
            };

            setIncomingNfs(result.items || []);
            setIncomingTotal(result.total || 0);
        } catch {
            toast.error('Erro ao carregar NFs de entrada.');
        } finally {
            setLoadingIncoming(false);
        }
    }

    async function loadPurchases() {
        try {
            const response = await api.get('/purchases', {
                params: { storeId: getActiveStore()?.id || undefined },
            });

            const relevant = (response.data as PurchaseOption[]).filter(
                (purchase) => !EXCLUDED_STATUSES.includes(purchase.status),
            );

            setPurchases(relevant);
        } catch {
            toast.error('Erro ao carregar compras.');
        }
    }

    useEffect(() => {
        loadPurchases();
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

    const incomingTotalPages = Math.max(
        1,
        Math.ceil(incomingTotal / PAGE_SIZE),
    );

    async function handleDownload() {
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

            const response = await api.get(
                '/purchases/incoming-goods-nf/download/zip',
                { params, responseType: 'blob' },
            );

            const blobUrl = window.URL.createObjectURL(
                new Blob([response.data]),
            );

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download =
                mode === 'MONTH'
                    ? `nf-entrada-${month}.zip`
                    : `nf-entrada-${startDate || 'inicio'}-a-${endDate || 'fim'
                    }.zip`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch (error: any) {
            // Como a requisição pede responseType: 'blob', um erro do
            // backend (400/500) também chega como Blob em vez de já vir
            // parseado — sem isso, o toast sempre mostrava um texto
            // genérico e escondia o motivo real (ex: "nenhuma NF nesse
            // período" vs. um erro de verdade no servidor).
            let message = 'Erro ao gerar o arquivo.';

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

    async function handleSync() {
        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setSyncing(true);

            const response = await api.post('/purchases/incoming-goods-nf/sync', {
                storeId: store.id,
            });

            const result = response.data as { resumoCount: number };

            toast.success(
                result.resumoCount > 0
                    ? `${result.resumoCount} NF(s) nova(s) encontrada(s).`
                    : 'Busca concluída — nenhuma NF nova na Sefaz.',
            );

            if (incomingPage === 1) {
                await loadIncomingNfs(1);
            } else {
                setIncomingPage(1);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao buscar NFs na Sefaz.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSyncing(false);
        }
    }

    async function handleUploadXml(fileList: FileList | null) {
        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!fileList || fileList.length === 0) return;

        const formData = new FormData();
        formData.append('storeId', store.id);

        Array.from(fileList).forEach((file) => formData.append('files', file));

        try {
            setUploading(true);
            setImportErrors([]);

            const response = await api.post(
                '/purchases/incoming-goods-nf/import-xml',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const result = response.data as {
                imported: number;
                errors: { fileName: string; reason: string }[];
            };

            if (result.imported > 0) {
                toast.success(`${result.imported} NF(s) importada(s) do XML.`);
            }

            if (result.errors.length > 0) {
                setImportErrors(result.errors);
                toast.error(
                    `${result.errors.length} arquivo(s) não puderam ser importados.`,
                );
            }

            if (incomingPage === 1) {
                await loadIncomingNfs(1);
            } else {
                setIncomingPage(1);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao importar os XMLs.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    async function handleLink(incomingId: string) {
        const purchaseId = selectedPurchaseId[incomingId];

        if (!purchaseId) {
            toast.error('Selecione a compra correspondente.');
            return;
        }

        try {
            setBusyId(incomingId);

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/link`, {
                purchaseId,
            });

            toast.success('NF vinculada à compra.');
            setLinkingId(null);

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao vincular a NF.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setBusyId(null);
        }
    }

    async function handleIgnore(incomingId: string) {
        const confirmed = confirm('Recusar essa NF (marcar como "não é nossa")?');
        if (!confirmed) return;

        try {
            setBusyId(incomingId);

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/ignore`);

            toast.success('NF recusada.');

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }
        } catch {
            toast.error('Erro ao recusar a NF.');
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

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/accept`, {
                generateBill: false,
            });

            toast.success('NF aceita.');

            const goBackAPage = incomingNfs.length === 1 && incomingPage > 1;

            if (goBackAPage) {
                setIncomingPage(incomingPage - 1);
            } else {
                await loadIncomingNfs(incomingPage);
            }
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao aceitar a NF.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
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

            await api.post(`/purchases/incoming-goods-nf/${incomingId}/accept`, {
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
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao gerar a conta a pagar.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Buscar NFs de compra na Sefaz
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Busca as NF-e de mercadoria emitidas contra o CNPJ
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

                    <button
                        onClick={handleSync}
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

                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
                    <p className="w-full text-sm font-semibold sm:w-auto">
                        Baixar NFs do período
                    </p>

                    <div
                        data-tour="entrada-download-mode"
                        className="flex rounded-xl border border-zinc-300 dark:border-zinc-700 p-1"
                    >
                        <button
                            onClick={() => setMode('MONTH')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'MONTH'
                                ? 'bg-blue-500 text-white'
                                : 'text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            Por mês
                        </button>
                        <button
                            onClick={() => setMode('RANGE')}
                            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${mode === 'RANGE'
                                ? 'bg-blue-500 text-white'
                                : 'text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            Por período
                        </button>
                    </div>

                    {mode === 'MONTH' ? (
                        <input
                            data-tour="entrada-download-period"
                            type="month"
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                        />
                    ) : (
                        <div
                            data-tour="entrada-download-period"
                            className="flex items-center gap-2"
                        >
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                            />
                            <span className="text-sm text-zinc-500">até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                            />
                        </div>
                    )}

                    <button
                        data-tour="entrada-download-button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                        {downloading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Download size={16} />
                        )}
                        Baixar todas as NFs (.zip)
                    </button>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm font-semibold">
                            Ou importe os XMLs manualmente
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                            Caso a busca automática não funcione, suba vários
                            XMLs de compra de uma vez (pegos com o
                            fornecedor, por exemplo). Só entra se o CNPJ
                            destinatário do XML for o da loja ativa.
                        </p>
                    </div>

                    <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 font-semibold text-blue-500 hover:bg-blue-500/20">
                        {uploading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Upload size={18} />
                        )}
                        Importar XMLs
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xml,text/xml,application/xml"
                            multiple
                            disabled={uploading}
                            className="hidden"
                            onChange={(e) => handleUploadXml(e.target.files)}
                        />
                    </label>
                </div>

                {importErrors.length > 0 && (
                    <div className="mt-3 space-y-1 rounded-2xl border border-red-500/30 bg-red-500/5 p-3">
                        <p className="text-sm font-semibold text-red-500">
                            {importErrors.length} arquivo(s) não importados
                        </p>
                        {importErrors.map((error, index) => (
                            <p
                                key={index}
                                className="text-xs text-zinc-600 dark:text-zinc-400"
                            >
                                {error.fileName}: {error.reason}
                            </p>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">NFs de entrada</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            {incomingTotal}{' '}
                            {showAccepted
                                ? 'NF(s) aceita(s)'
                                : 'NF(s) aguardando conciliação'}
                        </p>
                    </div>

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
                </div>

                {loadingIncoming ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : incomingNfs.length === 0 ? (
                    <div className="py-8 text-center">
                        <FileSearch className="mx-auto mb-3 text-zinc-500" />
                        <p className="text-zinc-600 dark:text-zinc-400">
                            {showAccepted
                                ? 'Nenhuma NF de entrada aceita ainda.'
                                : 'Nenhuma NF de entrada pendente no momento.'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {incomingNfs.map((nf) => (
                            <div
                                key={nf.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold">
                                                {nf.issuerName ||
                                                    'Fornecedor não identificado'}
                                            </p>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${nf.source === 'XML_UPLOAD'
                                                    ? 'bg-blue-500/10 text-blue-500'
                                                    : 'bg-purple-500/10 text-purple-500'
                                                    }`}
                                            >
                                                {nf.source === 'XML_UPLOAD'
                                                    ? 'Importado'
                                                    : 'Via Sefaz'}
                                            </span>
                                        </div>

                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            CNPJ: {nf.issuerCnpj || 'Não informado'} •{' '}
                                            {formatDate(nf.issueDate)}
                                            {nf.situacao ? ` • ${nf.situacao}` : ''}
                                        </p>

                                        <p className="mt-1 text-xl font-bold text-orange-400">
                                            {formatCurrency(nf.value)}
                                        </p>

                                        <p className="mt-1 break-all text-xs text-zinc-500">
                                            Chave: {nf.chaveAcesso}
                                        </p>

                                        {nf.tipoDocumento?.startsWith('resNFe') && (
                                            <p
                                                className={`mt-1 text-xs ${nf.manifestedAt
                                                    ? 'text-zinc-500'
                                                    : 'text-amber-600 dark:text-amber-500'
                                                    }`}
                                            >
                                                {nf.manifestedAt
                                                    ? 'Ciência da operação enviada — aguardando a Sefaz liberar o XML completo (pode levar algumas horas).'
                                                    : nf.manifestStatus
                                                        ? `Manifestação: ${nf.manifestStatus}`
                                                        : 'Aguardando manifestação automática (Ciência da Operação) na próxima busca.'}
                                            </p>
                                        )}

                                        <div className="mt-1 flex flex-wrap gap-3">
                                            <button
                                                onClick={() => setViewingId(nf.id)}
                                                className="inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:underline"
                                            >
                                                <Eye size={14} />
                                                Visualizar
                                            </button>

                                            {nf.fileUrl && (
                                                <a
                                                    href={`${API_URL}${nf.fileUrl}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-block text-sm font-medium text-blue-500 hover:underline"
                                                >
                                                    Abrir XML
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:min-w-[260px]">
                                        {showAccepted ? (
                                            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-500">
                                                <CheckCircle2 size={16} />
                                                {nf.purchaseId
                                                    ? 'Vinculada a uma compra'
                                                    : nf.billId
                                                        ? 'Aceita — conta a pagar criada'
                                                        : 'Aceita sem gerar conta'}
                                            </span>
                                        ) : linkingId === nf.id ? (
                                            <>
                                                <select
                                                    value={
                                                        selectedPurchaseId[nf.id] || ''
                                                    }
                                                    onChange={(e) =>
                                                        setSelectedPurchaseId({
                                                            ...selectedPurchaseId,
                                                            [nf.id]: e.target.value,
                                                        })
                                                    }
                                                    className="h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500"
                                                >
                                                    <option value="">
                                                        Selecione a compra...
                                                    </option>
                                                    {purchases.map((purchase) => (
                                                        <option
                                                            key={purchase.id}
                                                            value={purchase.id}
                                                        >
                                                            {purchase.description} —{' '}
                                                            {formatCurrency(purchase.value)}
                                                        </option>
                                                    ))}
                                                </select>

                                                <div className="flex gap-2">
                                                    <button
                                                        disabled={busyId === nf.id}
                                                        onClick={() => handleLink(nf.id)}
                                                        className="h-10 flex-1 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                                                    >
                                                        {busyId === nf.id
                                                            ? 'Vinculando...'
                                                            : 'Confirmar vínculo'}
                                                    </button>

                                                    <button
                                                        onClick={() => setLinkingId(null)}
                                                        className="h-10 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </>
                                        ) : acceptingId === nf.id ? null : (
                                            <>
                                                <button
                                                    onClick={() => setLinkingId(nf.id)}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 text-sm font-medium text-blue-500 hover:bg-blue-500/20"
                                                >
                                                    <Link2 size={16} />
                                                    Vincular à compra existente
                                                </button>

                                                <button
                                                    onClick={() => setAcceptingId(nf.id)}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    Aceitar e gerar conta
                                                </button>

                                                <button
                                                    disabled={busyId === nf.id}
                                                    onClick={() => handleAcceptWithoutBill(nf.id)}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                                                >
                                                    Aceitar sem gerar conta
                                                </button>

                                                <button
                                                    disabled={busyId === nf.id}
                                                    onClick={() => handleIgnore(nf.id)}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                                >
                                                    Recusar
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {acceptingId === nf.id && (
                                    <div className="mt-3">
                                        <AcceptNfBillForm
                                            initialSupplierName={
                                                nf.issuerName || ''
                                            }
                                            initialValue={nf.value}
                                            submitting={busyId === nf.id}
                                            onCancel={() => setAcceptingId(null)}
                                            onSubmit={(payload) =>
                                                handleAcceptWithBill(nf.id, payload)
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

            {viewingId && (
                <NfViewerModal
                    title="NF de entrada"
                    viewUrl={`/purchases/incoming-goods-nf/${viewingId}/view`}
                    onClose={() => setViewingId(null)}
                />
            )}
        </div>
    );
}
