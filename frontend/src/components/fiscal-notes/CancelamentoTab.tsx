'use client';

import { useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { NfViewerModal } from '../ui/NfViewerModal';
import { Ban, Eye, FileX2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type CancelableDoc = {
    id: string;
    kind: 'PERDA' | 'DEVOLUCAO';
    label: string;
    status: string;
    numero?: number | null;
    serie?: number | null;
    createdAt: string;
    xmlFileUrl?: string | null;
    valorTotal: number;
};

function formatCurrency(value: number) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value?: string | null) {
    if (!value) return 'Data não informada';
    return new Date(value).toLocaleDateString('pt-BR');
}

const STATUS_LABEL: Record<string, string> = {
    RASCUNHO: 'Rascunho (não enviada à Sefaz)',
    ENVIADA: 'Enviada — aguardando retorno',
    AUTORIZADA: 'Autorizada',
    REJEITADA: 'Rejeitada',
    CANCELADA: 'Cancelada',
};

export function CancelamentoTab() {
    const [docs, setDocs] = useState<CancelableDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [viewing, setViewing] = useState<{ id: string; kind: 'PERDA' | 'DEVOLUCAO' } | null>(null);

    async function loadDocs() {
        try {
            setLoading(true);

            const storeId = getActiveStore()?.id || undefined;

            const [lossRes, devolucaoRes] = await Promise.all([
                api.get('/losses/nfe', { params: { storeId } }),
                api.get('/devolucoes', { params: { storeId } }),
            ]);

            const losses: CancelableDoc[] = (lossRes.data || []).map(
                (nfe: any) => ({
                    id: nfe.id,
                    kind: 'PERDA' as const,
                    label: `NF de perda — ${nfe.store?.name || ''}`,
                    status: nfe.status,
                    numero: nfe.numero,
                    serie: nfe.serie,
                    createdAt: nfe.createdAt,
                    xmlFileUrl: nfe.xmlFileUrl,
                    valorTotal: (nfe.losses || []).reduce(
                        (sum: number, loss: any) =>
                            sum + Number(loss.quantity) * Number(loss.unitValue || 0),
                        0,
                    ),
                }),
            );

            const devolucoes: CancelableDoc[] = (devolucaoRes.data || []).map(
                (dev: any) => ({
                    id: dev.id,
                    kind: 'DEVOLUCAO' as const,
                    label: `Devolução — ${dev.incomingGoodsNf?.issuerName || 'fornecedor'}`,
                    status: dev.status,
                    numero: dev.numero,
                    serie: dev.serie,
                    createdAt: dev.createdAt,
                    xmlFileUrl: dev.xmlFileUrl,
                    valorTotal: (dev.itens || []).reduce(
                        (sum: number, item: any) => sum + Number(item.valorTotal),
                        0,
                    ),
                }),
            );

            setDocs(
                [...losses, ...devolucoes].sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                ),
            );
        } catch {
            toast.error('Erro ao carregar documentos.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadDocs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleCancel(doc: CancelableDoc) {
        const confirmed = confirm(
            `Cancelar "${doc.label}"? Essa ação não pode ser desfeita — o documento fica marcado como cancelado e sai da fila de emissão.`,
        );
        if (!confirmed) return;

        try {
            setCancelingId(doc.id);

            const url =
                doc.kind === 'PERDA'
                    ? `/losses/nfe/${doc.id}/cancel`
                    : `/devolucoes/${doc.id}/cancel`;

            await api.patch(url);

            toast.success('Documento cancelado.');
            await loadDocs();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao cancelar.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setCancelingId(null);
        }
    }

    return (
        <div className="space-y-5">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <h2 className="text-lg font-bold">Cancelamento de documentos</h2>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Só é possível cancelar documentos que o próprio sistema emite
                    (NF de perda e NF de devolução) — não dá pra cancelar uma NF
                    de fornecedor, isso só quem emitiu pode fazer. E só enquanto
                    o documento ainda está em rascunho (não enviado pra Sefaz);
                    depois de autorizada, o cancelamento exige um evento próprio
                    que ainda não está disponível aqui.
                </p>

                {loading ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : docs.length === 0 ? (
                    <div className="py-8 text-center">
                        <FileX2 className="mx-auto mb-3 text-zinc-500" />
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Nenhuma NF de perda ou devolução criada ainda.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {docs.map((doc) => (
                            <div
                                key={`${doc.kind}-${doc.id}`}
                                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 lg:flex-row lg:items-center lg:justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-semibold">{doc.label}</p>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${doc.kind === 'PERDA'
                                                ? 'bg-red-500/10 text-red-400'
                                                : 'bg-blue-500/10 text-blue-500'
                                                }`}
                                        >
                                            {doc.kind === 'PERDA' ? 'Perda' : 'Devolução'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                        Série {doc.serie ?? '—'} / Número {doc.numero ?? '—'} •{' '}
                                        {formatDate(doc.createdAt)} •{' '}
                                        {formatCurrency(doc.valorTotal)}
                                    </p>
                                    <p className="mt-1 text-xs">
                                        <span
                                            className={
                                                doc.status === 'CANCELADA'
                                                    ? 'text-red-400'
                                                    : doc.status === 'RASCUNHO'
                                                        ? 'text-amber-600 dark:text-amber-500'
                                                        : 'text-emerald-500'
                                            }
                                        >
                                            {STATUS_LABEL[doc.status] || doc.status}
                                        </span>
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                    <button
                                        onClick={() => setViewing({ id: doc.id, kind: doc.kind })}
                                        className="inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:underline"
                                    >
                                        <Eye size={14} />
                                        Visualizar
                                    </button>

                                    {doc.xmlFileUrl && (
                                        <a
                                            href={`${API_URL}${doc.xmlFileUrl}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-sm font-medium text-blue-500 hover:underline"
                                        >
                                            Abrir XML
                                        </a>
                                    )}

                                    {doc.status === 'RASCUNHO' ? (
                                        <button
                                            disabled={cancelingId === doc.id}
                                            onClick={() => handleCancel(doc)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                                        >
                                            <Ban size={14} />
                                            Cancelar
                                        </button>
                                    ) : doc.status === 'CANCELADA' ? (
                                        <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
                                            <XCircle size={14} />
                                            Já cancelada
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {viewing && (
                <NfViewerModal
                    title={viewing.kind === 'PERDA' ? 'NF de perda' : 'NF de devolução'}
                    viewUrl={
                        viewing.kind === 'PERDA'
                            ? `/losses/nfe/${viewing.id}/view`
                            : `/devolucoes/${viewing.id}/view`
                    }
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
