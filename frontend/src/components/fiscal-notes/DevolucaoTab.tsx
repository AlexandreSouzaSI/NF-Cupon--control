'use client';

import { useEffect, useState } from 'react';
import { api, API_URL } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { NfViewerModal } from '../ui/NfViewerModal';
import {
    ArrowLeft,
    CheckCircle2,
    Eye,
    Loader2,
    PackageX,
    RotateCcw,
    XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

type IncomingGoodsNf = {
    id: string;
    chaveAcesso: string;
    issuerCnpj?: string | null;
    issuerName?: string | null;
    value?: string | null;
    issueDate?: string | null;
    fileUrl?: string | null;
    accepted?: boolean;
};

type DevolucaoItemOption = {
    nItemOrigem: number;
    descricao: string;
    ncm?: string;
    cfopOrigem?: string;
    cfopDevolucaoSugerido: string | null;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    quantidadeJaDevolvida: number;
};

type SelectedItem = {
    checked: boolean;
    quantidade: number;
    cfopManual: string;
};

type DevolucaoNfe = {
    id: string;
    status: string;
    numero?: number | null;
    serie?: number | null;
    chaveAcesso?: string | null;
    motivo: string;
    createdAt: string;
    xmlFileUrl?: string | null;
    incomingGoodsNf?: { issuerName?: string | null; chaveAcesso?: string } | null;
    itens: { descricao: string; quantidade: string; valorTotal: string }[];
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

const STATUS_LABEL: Record<string, string> = {
    RASCUNHO: 'Rascunho (não enviada à Sefaz)',
    ENVIADA: 'Enviada — aguardando retorno',
    AUTORIZADA: 'Autorizada',
    REJEITADA: 'Rejeitada',
    CANCELADA: 'Cancelada',
};

export function DevolucaoTab() {
    const [acceptedNfs, setAcceptedNfs] = useState<IncomingGoodsNf[]>([]);
    const [loadingNfs, setLoadingNfs] = useState(true);

    const [selectedNfId, setSelectedNfId] = useState<string | null>(null);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemsOptions, setItemsOptions] = useState<DevolucaoItemOption[]>([]);
    const [selected, setSelected] = useState<Record<number, SelectedItem>>({});
    const [motivo, setMotivo] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const [devolucoes, setDevolucoes] = useState<DevolucaoNfe[]>([]);
    const [loadingDevolucoes, setLoadingDevolucoes] = useState(true);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [cancelingId, setCancelingId] = useState<string | null>(null);

    async function loadAcceptedNfs() {
        try {
            setLoadingNfs(true);

            const response = await api.get('/purchases/incoming-goods-nf', {
                params: {
                    storeId: getActiveStore()?.id || undefined,
                    page: 1,
                    pageSize: 100,
                    accepted: true,
                },
            });

            const result = response.data as { items: IncomingGoodsNf[] };
            setAcceptedNfs(result.items || []);
        } catch {
            toast.error('Erro ao carregar NFs aceitas.');
        } finally {
            setLoadingNfs(false);
        }
    }

    async function loadDevolucoes() {
        try {
            setLoadingDevolucoes(true);

            const response = await api.get('/devolucoes', {
                params: { storeId: getActiveStore()?.id || undefined },
            });

            setDevolucoes(response.data || []);
        } catch {
            toast.error('Erro ao carregar devoluções.');
        } finally {
            setLoadingDevolucoes(false);
        }
    }

    useEffect(() => {
        loadAcceptedNfs();
        loadDevolucoes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handleSelectNf(nf: IncomingGoodsNf) {
        setSelectedNfId(nf.id);
        setSelected({});
        setMotivo('');

        try {
            setLoadingItems(true);

            const response = await api.get(
                `/devolucoes/incoming-nf/${nf.id}/items`,
            );

            const result = response.data as { itens: DevolucaoItemOption[] };
            setItemsOptions(result.itens || []);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao carregar itens dessa NF.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
            setSelectedNfId(null);
        } finally {
            setLoadingItems(false);
        }
    }

    function toggleItem(item: DevolucaoItemOption, checked: boolean) {
        const disponivel = (item.quantidade || 0) - item.quantidadeJaDevolvida;

        setSelected((prev) => ({
            ...prev,
            [item.nItemOrigem]: checked
                ? {
                    checked: true,
                    quantidade: Math.max(disponivel, 0),
                    cfopManual: prev[item.nItemOrigem]?.cfopManual || '',
                }
                : { ...prev[item.nItemOrigem], checked: false },
        }));
    }

    function updateQuantidade(nItem: number, quantidade: number) {
        setSelected((prev) => ({
            ...prev,
            [nItem]: { ...prev[nItem], quantidade },
        }));
    }

    function updateCfopManual(nItem: number, cfop: string) {
        setSelected((prev) => ({
            ...prev,
            [nItem]: { ...prev[nItem], cfopManual: cfop },
        }));
    }

    async function handleSubmit() {
        if (!selectedNfId) return;

        const itensParaEnviar = itemsOptions
            .filter((item) => selected[item.nItemOrigem]?.checked)
            .map((item) => {
                const sel = selected[item.nItemOrigem];

                return {
                    nItemOrigem: item.nItemOrigem,
                    descricao: item.descricao,
                    ncm: item.ncm,
                    cfopOrigem: item.cfopOrigem,
                    cfopDevolucaoManual: item.cfopDevolucaoSugerido
                        ? undefined
                        : sel.cfopManual || undefined,
                    quantidade: sel.quantidade,
                    unidade: item.unidade,
                    valorUnitario: item.valorUnitario,
                };
            });

        if (itensParaEnviar.length === 0) {
            toast.error('Selecione ao menos um item pra devolver.');
            return;
        }

        if (!motivo.trim()) {
            toast.error('Informe o motivo da devolução.');
            return;
        }

        const faltandoCfop = itensParaEnviar.some(
            (item) => !item.cfopDevolucaoManual && !itemsOptions.find(
                (opt) => opt.nItemOrigem === item.nItemOrigem,
            )?.cfopDevolucaoSugerido,
        );

        if (faltandoCfop) {
            toast.error(
                'Informe o CFOP de devolução manualmente pros itens sem sugestão automática.',
            );
            return;
        }

        try {
            setSubmitting(true);

            await api.post('/devolucoes', {
                storeId: getActiveStore()?.id,
                incomingGoodsNfId: selectedNfId,
                motivo: motivo.trim(),
                itens: itensParaEnviar,
            });

            toast.success('Rascunho da NF de devolução criado.');
            setSelectedNfId(null);
            setItemsOptions([]);
            setSelected({});
            setMotivo('');
            await loadDevolucoes();
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao criar a NF de devolução.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCancel(id: string) {
        const confirmed = confirm(
            'Cancelar esse rascunho de devolução? As quantidades voltam a ficar disponíveis pra devolver de novo.',
        );
        if (!confirmed) return;

        try {
            setCancelingId(id);
            await api.patch(`/devolucoes/${id}/cancel`);
            toast.success('Devolução cancelada.');
            await loadDevolucoes();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao cancelar.';

            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setCancelingId(null);
        }
    }

    if (selectedNfId) {
        return (
            <div className="space-y-5">
                <button
                    onClick={() => {
                        setSelectedNfId(null);
                        setItemsOptions([]);
                        setSelected({});
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-500 hover:underline"
                >
                    <ArrowLeft size={16} />
                    Voltar pra lista de NFs
                </button>

                <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                    <h2 className="text-lg font-bold">Selecione os itens a devolver</h2>
                    <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                        Marque só os itens que serão devolvidos — pode ajustar a
                        quantidade (ex: devolver só parte do que veio na NF).
                    </p>

                    {loadingItems ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Carregando itens...
                        </p>
                    ) : itemsOptions.length === 0 ? (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhum item encontrado nessa NF.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {itemsOptions.map((item) => {
                                const disponivel =
                                    (item.quantidade || 0) - item.quantidadeJaDevolvida;
                                const sel = selected[item.nItemOrigem];
                                const esgotado = disponivel <= 0;

                                return (
                                    <div
                                        key={item.nItemOrigem}
                                        className={`rounded-2xl border p-3 ${esgotado
                                            ? 'border-zinc-200 dark:border-zinc-800 opacity-50'
                                            : 'border-zinc-200 dark:border-zinc-800'
                                            }`}
                                    >
                                        <label className="flex items-start gap-3">
                                            <input
                                                type="checkbox"
                                                disabled={esgotado}
                                                checked={sel?.checked || false}
                                                onChange={(e) =>
                                                    toggleItem(item, e.target.checked)
                                                }
                                                className="mt-1 h-4 w-4 accent-blue-500"
                                            />
                                            <div className="flex-1">
                                                <p className="font-semibold">
                                                    {item.descricao}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    NCM {item.ncm || '—'} • CFOP origem{' '}
                                                    {item.cfopOrigem || '—'} • recebido{' '}
                                                    {item.quantidade} {item.unidade} •{' '}
                                                    {formatCurrency(item.valorUnitario)}/un
                                                    {item.quantidadeJaDevolvida > 0 &&
                                                        ` • já devolvido: ${item.quantidadeJaDevolvida}`}
                                                </p>
                                                {esgotado && (
                                                    <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
                                                        Já devolvido por completo.
                                                    </p>
                                                )}
                                            </div>
                                        </label>

                                        {sel?.checked && (
                                            <div className="mt-3 flex flex-wrap items-center gap-3 pl-7">
                                                <label className="flex items-center gap-2 text-sm">
                                                    Quantidade a devolver:
                                                    <input
                                                        type="number"
                                                        min={0.001}
                                                        max={disponivel}
                                                        step="0.001"
                                                        value={sel.quantidade}
                                                        onChange={(e) =>
                                                            updateQuantidade(
                                                                item.nItemOrigem,
                                                                Number(e.target.value),
                                                            )
                                                        }
                                                        className="h-9 w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2 text-sm outline-none focus:border-blue-500"
                                                    />
                                                </label>

                                                {item.cfopDevolucaoSugerido ? (
                                                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
                                                        CFOP devolução: {item.cfopDevolucaoSugerido}
                                                    </span>
                                                ) : (
                                                    <label className="flex items-center gap-2 text-sm">
                                                        <span className="text-amber-600 dark:text-amber-500">
                                                            Sem CFOP automático — informe:
                                                        </span>
                                                        <input
                                                            type="text"
                                                            placeholder="ex: 5202"
                                                            value={sel.cfopManual}
                                                            onChange={(e) =>
                                                                updateCfopManual(
                                                                    item.nItemOrigem,
                                                                    e.target.value,
                                                                )
                                                            }
                                                            className="h-9 w-24 rounded-lg border border-amber-400 bg-zinc-50 dark:bg-zinc-950 px-2 text-sm outline-none"
                                                        />
                                                    </label>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="mt-5 space-y-3">
                        <label className="block text-sm font-medium">
                            Motivo da devolução
                            <textarea
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                rows={2}
                                placeholder="Ex: produto vencido, quantidade errada, avariado..."
                                className="mt-1 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm outline-none focus:border-blue-500"
                            />
                        </label>

                        <p className="text-xs text-zinc-500">
                            A NF de devolução nasce como rascunho assinado, em
                            ambiente de homologação (sem valor fiscal) — o envio
                            real pra Sefaz ainda não está automatizado.
                        </p>

                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                        >
                            {submitting ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <RotateCcw size={16} />
                            )}
                            Gerar rascunho da devolução
                        </button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <h2 className="text-lg font-bold">Devolver mercadoria a fornecedor</h2>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Escolha uma NF de entrada já aceita — pode devolver só um ou
                    alguns itens, não precisa devolver a nota inteira.
                </p>

                {loadingNfs ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : acceptedNfs.length === 0 ? (
                    <div className="py-8 text-center">
                        <PackageX className="mx-auto mb-3 text-zinc-500" />
                        <p className="text-zinc-600 dark:text-zinc-400">
                            Nenhuma NF de entrada aceita ainda — aceite uma na
                            aba &quot;Notas Fiscais de Entrada&quot; antes de
                            devolver.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {acceptedNfs.map((nf) => (
                            <button
                                key={nf.id}
                                onClick={() => handleSelectNf(nf)}
                                className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 text-left hover:border-blue-500"
                            >
                                <p className="font-semibold">
                                    {nf.issuerName || 'Fornecedor não identificado'}
                                </p>
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                    CNPJ: {nf.issuerCnpj || 'Não informado'} •{' '}
                                    {formatDate(nf.issueDate)}
                                </p>
                                <p className="text-sm font-bold text-orange-400">
                                    {formatCurrency(nf.value)}
                                </p>
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <h2 className="mb-4 text-lg font-bold">Devoluções criadas</h2>

                {loadingDevolucoes ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Carregando...
                    </p>
                ) : devolucoes.length === 0 ? (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Nenhuma devolução criada ainda.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {devolucoes.map((dev) => (
                            <div
                                key={dev.id}
                                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4"
                            >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <p className="font-semibold">
                                            Devolução para{' '}
                                            {dev.incomingGoodsNf?.issuerName ||
                                                'fornecedor'}
                                        </p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            Série {dev.serie ?? '—'} / Número{' '}
                                            {dev.numero ?? '—'} •{' '}
                                            {formatDate(dev.createdAt)}
                                        </p>
                                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                            {dev.itens.length} item(ns) •{' '}
                                            {formatCurrency(
                                                dev.itens.reduce(
                                                    (sum, item) =>
                                                        sum + Number(item.valorTotal),
                                                    0,
                                                ),
                                            )}
                                        </p>
                                        <p className="mt-1 text-xs">
                                            <span
                                                className={
                                                    dev.status === 'CANCELADA'
                                                        ? 'text-red-400'
                                                        : dev.status === 'RASCUNHO'
                                                            ? 'text-amber-600 dark:text-amber-500'
                                                            : 'text-emerald-500'
                                                }
                                            >
                                                {STATUS_LABEL[dev.status] || dev.status}
                                            </span>
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            onClick={() => setViewingId(dev.id)}
                                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-500 hover:underline"
                                        >
                                            <Eye size={14} />
                                            Visualizar
                                        </button>

                                        {dev.xmlFileUrl && (
                                            <a
                                                href={`${API_URL}${dev.xmlFileUrl}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm font-medium text-blue-500 hover:underline"
                                            >
                                                Abrir XML
                                            </a>
                                        )}

                                        {dev.status === 'RASCUNHO' && (
                                            <button
                                                disabled={cancelingId === dev.id}
                                                onClick={() => handleCancel(dev.id)}
                                                className="inline-flex items-center gap-1 text-sm font-medium text-red-400 hover:underline disabled:opacity-50"
                                            >
                                                <XCircle size={14} />
                                                Cancelar
                                            </button>
                                        )}

                                        {dev.status === 'CANCELADA' && (
                                            <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
                                                <CheckCircle2 size={14} />
                                                Cancelada
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {viewingId && (
                <NfViewerModal
                    title="NF de devolução"
                    viewUrl={`/devolucoes/${viewingId}/view`}
                    onClose={() => setViewingId(null)}
                />
            )}
        </div>
    );
}
