'use client';

import { useEffect, useState } from 'react';
import { FileText, Link2, Loader2, Search, Unlink, X } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';

// =============================================================================
// NF da conta a pagar: mostra o número da NF na linha, abre a janela para
// atrelar / trocar / remover a nota (NF de entrada ou NFS-e já no sistema).
// =============================================================================

export type NfDaContaBill = {
    id: string;
    description: string;
    value: string | number;
    dueDate: string;
    nfEntrada?: { id: string; chaveAcesso: string; issuerName?: string | null; value?: string | number | null; issueDate?: string | null } | null;
    nfServico?: { id: string; chaveAcesso: string; numeroNf?: string | null; issuerName?: string | null; value?: string | number | null; issueDate?: string | null } | null;
};

type Candidata = {
    tipo: 'PRODUTO' | 'SERVICO';
    id: string;
    chave: string;
    numero: string | null;
    emitente: string | null;
    emitenteDoc: string | null;
    valor: number | null;
    emissao: string | null;
    contasVinculadas: { id: string; descricao: string; valor: number; vencimento: string }[];
    motivos?: string[];
};

const moeda = (v: number | string | null | undefined) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v?: string | null) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const erro = (e: any, padrao: string) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m ?? padrao;
};

// Número da NF ligada à conta (ou null).
export function numeroNfDaConta(bill: NfDaContaBill): string | null {
    if (bill.nfEntrada?.chaveAcesso && /^\d{44}$/.test(bill.nfEntrada.chaveAcesso)) {
        return String(Number(bill.nfEntrada.chaveAcesso.slice(25, 34)));
    }
    if (bill.nfServico) return bill.nfServico.numeroNf || 'NFS-e';
    return null;
}

export async function desvincularNf(billId: string) {
    await api.delete(`/bills/${billId}/nf`);
}

// Chip na linha da conta: "NF 13970269 ✕" ou "+ Atrelar NF".
export function NfChip({ bill, onAbrir, onRemovido }: { bill: NfDaContaBill; onAbrir: () => void; onRemovido: () => void }) {
    const numero = numeroNfDaConta(bill);
    const [removendo, setRemovendo] = useState(false);
    if (!numero) {
        return (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(); }}
                className="mt-1 inline-flex items-center gap-1 rounded border border-dashed border-gray-300 dark:border-zinc-700 px-1.5 py-0.5 text-[11px] text-gray-500 hover:border-blue-400 hover:text-blue-600">
                <Link2 size={11} /> Atrelar NF
            </button>
        );
    }
    return (
        <span className="mt-1 inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 pl-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300"
            onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={onAbrir} className="inline-flex items-center gap-1 py-0.5 hover:underline" title="Ver / trocar a NF">
                <FileText size={11} /> {bill.nfServico ? 'NFS-e' : 'NF'} {numero}
            </button>
            <button type="button" disabled={removendo} title="Esta NF não é desta conta — remover"
                onClick={async () => {
                    if (!confirm(`Remover a NF ${numero} desta conta?`)) return;
                    try {
                        setRemovendo(true);
                        await desvincularNf(bill.id);
                        toast.success('NF removida da conta.');
                        onRemovido();
                    } catch (e: any) {
                        toast.error(erro(e, 'Não foi possível remover.'));
                    } finally {
                        setRemovendo(false);
                    }
                }}
                className="px-1 py-0.5 rounded-r text-emerald-700/70 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-500/20">
                {removendo ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
            </button>
        </span>
    );
}

// Janela: NF atual + sugestões + busca.
export function NfVinculoModal({ bill, onClose, onChanged }: { bill: NfDaContaBill; onClose: () => void; onChanged: () => void }) {
    const [lista, setLista] = useState<Candidata[]>([]);
    const [busca, setBusca] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState<string | null>(null);
    const atualId = bill.nfEntrada?.id ?? bill.nfServico?.id ?? null;
    const numeroAtual = numeroNfDaConta(bill);

    async function carregar(q?: string) {
        setCarregando(true);
        try {
            const r = await api.get(`/bills/${bill.id}/nfs`, { params: { q: q?.trim() || undefined } });
            setLista(r.data ?? []);
        } catch (e: any) {
            toast.error(erro(e, 'Erro ao buscar as notas.'));
        } finally {
            setCarregando(false);
        }
    }
    useEffect(() => { carregar(); }, [bill.id]);

    async function atrelar(n: Candidata) {
        try {
            setSalvando(n.id);
            await api.put(`/bills/${bill.id}/nf`, { tipo: n.tipo, nfId: n.id });
            toast.success(`NF ${n.numero ?? ''} atrelada.`);
            onChanged();
            onClose();
        } catch (e: any) {
            toast.error(erro(e, 'Não foi possível atrelar.'));
        } finally {
            setSalvando(null);
        }
    }

    async function remover() {
        if (!confirm(`Remover a NF ${numeroAtual} desta conta?`)) return;
        try {
            setSalvando('remover');
            await desvincularNf(bill.id);
            toast.success('NF removida da conta.');
            onChanged();
            onClose();
        } catch (e: any) {
            toast.error(erro(e, 'Não foi possível remover.'));
        } finally {
            setSalvando(null);
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
            <div className="my-10 w-full max-w-2xl rounded-2xl bg-white dark:bg-zinc-900 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">Nota fiscal da conta</p>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">{bill.description} · {moeda(bill.value)} · vence {dataBR(bill.dueDate)}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
                </div>

                {atualId ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
                        <div className="text-sm text-emerald-900 dark:text-emerald-200">
                            <p className="font-semibold">{bill.nfServico ? 'NFS-e' : 'NF-e'} {numeroAtual} · {(bill.nfEntrada ?? bill.nfServico)?.issuerName ?? '—'}</p>
                            <p className="text-xs">{moeda((bill.nfEntrada ?? bill.nfServico)?.value)} · emitida {dataBR((bill.nfEntrada ?? bill.nfServico)?.issueDate)}</p>
                        </div>
                        <button type="button" onClick={remover} disabled={salvando === 'remover'}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10">
                            {salvando === 'remover' ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />} Não é desta conta — remover
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-gray-500 dark:text-zinc-400">Esta conta ainda não tem NF. Escolha abaixo (as mais prováveis primeiro).</p>
                )}

                <div className="flex gap-2">
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') carregar(busca); }}
                        placeholder="Buscar por número da NF, fornecedor, CNPJ ou valor"
                        className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white" />
                    <button type="button" onClick={() => carregar(busca)} className="inline-flex items-center gap-1 px-3 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm text-gray-700 dark:text-zinc-200">
                        <Search size={14} /> Buscar
                    </button>
                </div>

                <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800">
                    {carregando ? (
                        <p className="py-6 text-center text-sm text-gray-400"><Loader2 size={16} className="inline animate-spin" /> Procurando notas…</p>
                    ) : lista.length === 0 ? (
                        <p className="py-6 text-center text-sm text-gray-400">Nenhuma nota encontrada nesta loja. Tente buscar pelo número ou pelo fornecedor.</p>
                    ) : lista.map((n) => {
                        const outras = n.contasVinculadas.filter((c) => c.id !== bill.id);
                        const eAtual = n.id === atualId;
                        return (
                            <div key={n.id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0 text-sm">
                                    <p className="font-medium text-gray-900 dark:text-white truncate">{n.tipo === 'SERVICO' ? 'NFS-e' : 'NF'} {n.numero ?? '—'} · {n.emitente ?? '—'}</p>
                                    <p className="text-xs text-gray-500">
                                        {n.valor != null ? moeda(n.valor) : '—'} · emitida {dataBR(n.emissao)}
                                        {n.motivos?.length ? <span className="text-emerald-600"> · {n.motivos.join(', ')}</span> : null}
                                    </p>
                                    {outras.length > 0 && (
                                        <p className="text-xs text-amber-600">Já ligada a {outras.length} conta(s): {outras.slice(0, 2).map((c) => `${moeda(c.valor)} venc. ${dataBR(c.vencimento)}`).join('; ')}{outras.length > 2 ? '…' : ''}</p>
                                    )}
                                </div>
                                {eAtual ? (
                                    <span className="shrink-0 text-xs font-medium text-emerald-600">Atual</span>
                                ) : (
                                    <button type="button" onClick={() => atrelar(n)} disabled={!!salvando}
                                        className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium disabled:opacity-50">
                                        {salvando === n.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} {atualId ? 'Trocar por esta' : 'Atrelar'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
