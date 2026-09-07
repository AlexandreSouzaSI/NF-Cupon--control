'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { Pagination } from '../ui/Pagination';
import { NfViewerModal } from '../ui/NfViewerModal';
import {
    Eye,
    FileText,
    Loader2,
    TrendingUp,
    Upload,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

// Paginação aqui é por grupo de mês (não por NF individual), pra manter o
// total de cada mês sempre correto — nunca corta um mês ao meio.
const MONTHS_PER_PAGE = 3;

type OutgoingSalesNf = {
    id: string;
    chaveAcesso: string;
    tipoDocumento: string;
    recipientCnpj?: string | null;
    recipientName?: string | null;
    value: string;
    issueDate: string;
    referenceMonth: string;
    situacao?: string | null;
    fileUrl?: string | null;
    importedAt: string;
};

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

function formatMonth(referenceMonth: string) {
    const [year, month] = referenceMonth.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function SaidaNfTab() {
    const [notes, setNotes] = useState<OutgoingSalesNf[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [ignoringId, setIgnoringId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [importErrors, setImportErrors] = useState<
        { fileName: string; reason: string }[]
    >([]);
    const [revenueUpdated, setRevenueUpdated] = useState<
        { month: string; total: number }[]
    >([]);
    const [monthPage, setMonthPage] = useState(1);

    const fileInputRef = useRef<HTMLInputElement>(null);

    async function loadNotes() {
        try {
            setLoading(true);

            const response = await api.get('/outgoing-sales-nf', {
                params: { storeId: getActiveStore()?.id || undefined },
            });

            setNotes(response.data || []);
        } catch {
            toast.error('Erro ao carregar NFs de venda.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadNotes();
    }, []);

    const groupedByMonth = useMemo(() => {
        const groups: Record<string, OutgoingSalesNf[]> = {};

        for (const note of notes) {
            if (!groups[note.referenceMonth]) groups[note.referenceMonth] = [];
            groups[note.referenceMonth].push(note);
        }

        return Object.entries(groups).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    }, [notes]);

    useEffect(() => {
        setMonthPage(1);
    }, [notes]);

    const monthTotalPages = Math.max(
        1,
        Math.ceil(groupedByMonth.length / MONTHS_PER_PAGE),
    );

    const paginatedMonths = useMemo(
        () =>
            groupedByMonth.slice(
                (monthPage - 1) * MONTHS_PER_PAGE,
                monthPage * MONTHS_PER_PAGE,
            ),
        [groupedByMonth, monthPage],
    );

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
            setRevenueUpdated([]);

            const response = await api.post(
                '/outgoing-sales-nf/import-xml',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const result = response.data as {
                imported: number;
                errors: { fileName: string; reason: string }[];
                revenueUpdated: { month: string; total: number }[];
            };

            if (result.imported > 0) {
                toast.success(
                    `${result.imported} NF(s) de venda importada(s). Faturamento atualizado.`,
                );
                setRevenueUpdated(result.revenueUpdated);
            }

            if (result.errors.length > 0) {
                setImportErrors(result.errors);
                toast.error(
                    `${result.errors.length} arquivo(s) não puderam ser importados.`,
                );
            }

            await loadNotes();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao importar os XMLs.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    async function handleIgnore(id: string) {
        const confirmed = confirm(
            'Remover essa NF da lista? Ela vai sair do cálculo de Faturamento do mês.',
        );
        if (!confirmed) return;

        try {
            setIgnoringId(id);

            await api.post(`/outgoing-sales-nf/${id}/ignore`);

            toast.success('NF removida e Faturamento recalculado.');
            await loadNotes();
        } catch {
            toast.error('Erro ao remover a NF.');
        } finally {
            setIgnoringId(null);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-bold">
                            Importar NFs de venda
                        </h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Suba os XMLs das NF-e/NFC-e de venda exportados
                            do sistema de vendas/PDV da loja. Só entra se o
                            CNPJ emitente do XML for o da loja ativa.
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-cyan-600 dark:text-cyan-400">
                            <TrendingUp size={14} />
                            Ao importar, o Faturamento do mês (em Tributos)
                            é recalculado automaticamente a partir dessas
                            NFs.
                        </p>
                    </div>

                    <label className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-green-500 px-5 font-semibold text-zinc-900 dark:text-white hover:bg-green-600">
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

                {revenueUpdated.length > 0 && (
                    <div className="mb-3 space-y-1 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <p className="text-sm font-semibold text-emerald-500">
                            Faturamento atualizado
                        </p>
                        {revenueUpdated.map((entry) => (
                            <p
                                key={entry.month}
                                className="text-xs text-zinc-600 dark:text-zinc-400"
                            >
                                {formatMonth(entry.month)}:{' '}
                                {formatCurrency(entry.total)}
                            </p>
                        ))}
                    </div>
                )}

                {importErrors.length > 0 && (
                    <div className="space-y-1 rounded-2xl border border-red-500/30 bg-red-500/5 p-3">
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
                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : notes.length === 0 ? (
                    <div className="py-8 text-center">
                        <FileText className="mx-auto mb-3 text-zinc-500" />
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Nenhuma NF de venda importada ainda.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {paginatedMonths.map(([month, monthNotes]) => {
                            const total = monthNotes.reduce(
                                (sum, note) => sum + Number(note.value),
                                0,
                            );

                            return (
                                <div key={month}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <h3 className="font-semibold capitalize">
                                            {formatMonth(month)}
                                        </h3>
                                        <p className="text-sm font-semibold text-green-500">
                                            {monthNotes.length} NF(s) •{' '}
                                            {formatCurrency(total)}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        {monthNotes.map((note) => (
                                            <div
                                                key={note.id}
                                                className="flex flex-col gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div>
                                                    <p className="font-semibold">
                                                        {note.recipientName ||
                                                            'Consumidor não identificado'}
                                                    </p>
                                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                                        {formatDate(note.issueDate)} •{' '}
                                                        {formatCurrency(note.value)}
                                                        {note.tipoDocumento === '65'
                                                            ? ' • NFC-e'
                                                            : ' • NF-e'}
                                                    </p>
                                                    <p className="mt-1 break-all text-xs text-zinc-500">
                                                        Chave: {note.chaveAcesso}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setViewingId(note.id)}
                                                        className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-500 hover:bg-blue-500/20"
                                                    >
                                                        <Eye size={16} />
                                                        Visualizar
                                                    </button>

                                                    {note.fileUrl && (
                                                        <a
                                                            href={`${API_URL}${note.fileUrl}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20"
                                                        >
                                                            Abrir XML
                                                        </a>
                                                    )}

                                                    <button
                                                        disabled={ignoringId === note.id}
                                                        onClick={() => handleIgnore(note.id)}
                                                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                                        title="Remover"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        <Pagination
                            page={monthPage}
                            totalPages={monthTotalPages}
                            onPageChange={setMonthPage}
                        />
                    </div>
                )}
            </section>

            {viewingId && (
                <NfViewerModal
                    title="NF de venda"
                    viewUrl={`/outgoing-sales-nf/${viewingId}/view`}
                    onClose={() => setViewingId(null)}
                />
            )}
        </div>
    );
}
