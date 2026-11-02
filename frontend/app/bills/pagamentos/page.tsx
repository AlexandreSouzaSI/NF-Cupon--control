'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileText, Link2, Loader2, Paperclip, Store, Trash2, Upload, X } from 'lucide-react';

import { AppLayout } from '../../../src/components/app-layout';
import { AbasContas } from '../../../src/components/bills/AbasContas';
import { BillCategorySelect, useBillCategories } from '../../../src/components/bills/BillCategorySelect';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { canManagePaymentBatch, getUser } from '@/lib/auth';
import { MoneyInput } from '../../../src/components/ui/MoneyInput';

// =============================================================================
// Registrar Pagamentos — quem pagou avisa o pagamento (valor + fornecedor
// e/ou comprovante), por aqui, pelo link da loja ou pelo WhatsApp. O
// financeiro concilia na aba "A conciliar": dá baixa numa conta a pagar
// (o comprovante vai junto), cria a conta já paga, ou só marca conciliado.
// =============================================================================

const campo =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v: string) => new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
const hojeISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const numero = (t: string) => {
    const s = String(t ?? '').trim();
    if (!s) return 0;
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : 0;
};
const erroMsg = (e: any, padrao: string) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m ?? padrao;
};

type Aviso = {
    id: string;
    storeId: string | null;
    lojaPor: string | null;
    lojaNome: string | null;
    fornecedor: string;
    valor: number;
    dataPagamento: string;
    descricao: string | null;
    avisadoPorNome: string | null;
    status: 'PENDENTE' | 'CONCILIADO' | 'DESCARTADO';
    conciliadoPor: string | null;
    temComprovante: boolean;
    categoryId: string | null;
    categoriaNome: string | null;
    observacaoFinanceiro: string | null;
    createdAt: string;
};

type Sugestao = {
    pontos: number;
    conta: { id: string; descricao: string; vencimento: string; valor: number; fornecedor: string | null; loja: string | null };
};

export default function RegistrarPagamentosPage() {
    const loja = getActiveStore();
    const podeLink = canManagePaymentBatch(getUser());
    const { categories } = useBillCategories({ seedDefaults: true });
    const [token, setToken] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const urlLink = token && typeof window !== 'undefined' ? `${window.location.origin}/avisar/${token}` : '';

    useEffect(() => {
        const id = getActiveStore()?.id;
        if (podeLink && id) api.get('/contas-entrada/pagamentos/link', { params: { storeId: id } }).then((r) => setToken(r.data.token)).catch(() => { });
    }, [podeLink]);

    async function gerarLink() {
        if (token && !confirm('Gerar um novo link vai desativar o anterior. Continuar?')) return;
        const r = await api.post('/contas-entrada/pagamentos/link', { storeId: getActiveStore()?.id });
        setToken(r.data.token);
    }
    async function desativarLink() {
        if (!confirm('Desativar o link? Quem tem o link deixa de conseguir enviar.')) return;
        await api.delete('/contas-entrada/pagamentos/link', { params: { storeId: getActiveStore()?.id } });
        setToken(null);
    }
    async function copiar() {
        await navigator.clipboard.writeText(urlLink);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    }

    const [aba, setAba] = useState<'avisar' | 'conciliar'>('conciliar');
    const [itens, setItens] = useState<Aviso[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [filtro, setFiltro] = useState<'PENDENTE' | 'CONCILIADO'>('PENDENTE');
    const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);

    const [fornecedor, setFornecedor] = useState('');
    const [valor, setValor] = useState('');
    const [data, setData] = useState(hojeISO());
    const [descricao, setDescricao] = useState('');
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [categoryId, setCategoryId] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewMime, setPreviewMime] = useState('');
    const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
    const [obs, setObs] = useState('');
    const [valorPagoInput, setValorPagoInput] = useState('');
    const [lojaNova, setLojaNova] = useState('');
    const [categoriaNova, setCategoriaNova] = useState('');

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await api.get('/contas-entrada/pagamentos', { params: { status: filtro, storeId: getActiveStore()?.id || undefined } });
            setItens(r.data ?? []);
        } catch {
            setItens([]);
        } finally {
            setCarregando(false);
        }
    }, [filtro]);

    useEffect(() => { carregar(); }, [carregar]);
    useEffect(() => {
        api.get('/stores/switcher').then((r) => setLojas((Array.isArray(r.data) ? r.data : r.data?.items ?? []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => { });
    }, []);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        setMsg(null);
        setEnviando(true);
        try {
            const fd = new FormData();
            fd.append('fornecedor', fornecedor);
            fd.append('valor', valor);
            fd.append('data', data);
            fd.append('descricao', descricao);
            const id = getActiveStore()?.id;
            if (id) fd.append('storeId', id);
            if (categoryId) fd.append('categoryId', categoryId);
            if (arquivo) fd.append('file', arquivo);
            await api.post('/contas-entrada/pagamentos', fd);
            setFornecedor(''); setValor(''); setDescricao(''); setCategoryId(''); setArquivo(null); setData(hojeISO());
            setMsg('Pagamento enviado ao financeiro.');
            carregar();
        } catch (err: any) {
            setMsg(erroMsg(err, 'Não foi possível enviar.'));
        } finally {
            setEnviando(false);
        }
    }

    async function verComprovante(id: string) {
        const r = await api.get(`/contas-entrada/pagamentos/${id}/comprovante`, { responseType: 'blob' });
        window.open(URL.createObjectURL(r.data), '_blank');
    }

    function fechar() {
        setAbertoId(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    }

    // Esc fecha a tela de conciliação.
    useEffect(() => {
        if (!abertoId) return;
        const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') fechar(); };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    });

    async function abrir(id: string) {
        const aviso = itens.find((i) => i.id === id);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null); setPreviewMime('');
        setAbertoId(id); setObs(''); setSugestoes([]);
        if (aviso?.temComprovante) {
            api.get(`/contas-entrada/pagamentos/${id}/comprovante`, { responseType: 'blob' })
                .then((r) => { setPreviewMime(r.data?.type ?? ''); setPreviewUrl(URL.createObjectURL(r.data)); })
                .catch(() => undefined);
        }
        setValorPagoInput(aviso && aviso.valor > 0 ? String(aviso.valor).replace('.', ',') : '');
        setLojaNova(aviso?.storeId ?? getActiveStore()?.id ?? '');
        setCategoriaNova(aviso?.categoryId ?? '');
        const r = await api.get(`/contas-entrada/pagamentos/${id}/sugestoes`);
        setSugestoes(r.data ?? []);
    }

    async function conciliar(id: string, billId?: string, criarConta?: boolean) {
        try {
            await api.patch(`/contas-entrada/pagamentos/${id}/conciliar`, {
                billId,
                criarConta,
                storeId: lojaNova || undefined,
                categoryId: categoriaNova || undefined,
                valorPago: numero(valorPagoInput) || undefined,
                observacao: obs,
            });
            fechar();
            carregar();
        } catch (err: any) {
            alert(erroMsg(err, 'Não foi possível conciliar.'));
        }
    }

    // Chegou como comprovante mas é boleto/nota.
    async function moverParaContas(id: string) {
        if (!confirm('Este arquivo é boleto/nota (conta a pagar), não comprovante? Ele vai para Lançar contas.')) return;
        try {
            const r = await api.patch(`/contas-entrada/pagamentos/${id}/mover-para-contas`);
            alert(`Movido para Lançar contas${r.data?.total > 1 ? ` (${r.data.total} contas)` : ''}.`);
            carregar();
        } catch (err: any) {
            alert(erroMsg(err, 'Não foi possível mover.'));
        }
    }

    // Seleção para descartar vários de uma vez (ex.: fotos que não eram boleto).
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    async function descartarMarcados() {
        if (!marcados.size || !confirm(`Descartar ${marcados.size} item(ns)?`)) return;
        await api.patch('/contas-entrada/pagamentos/descartar-varios', { ids: [...marcados] });
        setMarcados(new Set());
        carregar();
    }

    async function descartar(id: string) {
        if (!confirm('Descartar este aviso?')) return;
        await api.patch(`/contas-entrada/pagamentos/${id}/descartar`);
        carregar();
    }

    return (
        <AppLayout title="Registrar Pagamentos">
            <div className="space-y-5">
                <AbasContas ativa="paga" />
                <div className="max-w-3xl space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Registrar Pagamentos</h1>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">
                            Avise um pagamento já feito (valor ou comprovante). O financeiro concilia depois — dá baixa na conta e o comprovante vai junto.{' '}
                            <Link href="/bills" className="text-blue-600 hover:underline">Ir para Contas a Pagar</Link>
                        </p>
                    </div>

                    <div className="flex gap-2">
                        {([['conciliar', 'A conciliar'], ['avisar', 'Avisar pagamento']] as const).map(([v, l]) => (
                            <button key={v} onClick={() => setAba(v)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${aba === v ? 'bg-blue-600 text-white' : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300'}`}>
                                {l}
                            </button>
                        ))}
                    </div>

                    {podeLink && (
                        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Link para o proprietário (sem login){loja ? ` — ${loja.name}` : ''}</p>
                            <p className="text-xs text-gray-500">Mande por WhatsApp. Quem abrir só consegue enviar comprovantes — não vê mais nada do sistema.</p>
                            {token && (
                                <div className="flex gap-2">
                                    <input readOnly value={urlLink} className={campo} onFocus={(e) => e.target.select()} />
                                    <button onClick={copiar} className="px-3 rounded-lg bg-blue-600 text-white text-sm whitespace-nowrap">{copiado ? 'Copiado!' : 'Copiar'}</button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button onClick={gerarLink} disabled={!loja} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 disabled:opacity-50">
                                    {token ? 'Gerar novo link' : 'Gerar link'}
                                </button>
                                {token && <button onClick={desativarLink} className="text-xs px-3 py-2 rounded-lg text-red-500">Desativar</button>}
                            </div>
                        </div>
                    )}

                    {aba === 'avisar' && (
                        <form onSubmit={enviar} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
                            <input className={campo} placeholder="Fornecedor / quem recebeu" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} />
                            <div className="grid grid-cols-2 gap-3">
                                <MoneyInput className={campo} placeholder="Valor pago (R$)" value={valor} onChange={(e) => setValor(e.target.value)} />
                                <input className={campo} type="date" value={data} onChange={(e) => setData(e.target.value)} />
                            </div>
                            <input className={campo} placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
                            <BillCategorySelect categories={categories} value={categoryId} onChange={setCategoryId} placeholder="Categoria (opcional)" className={campo} />
                            <label className="flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 text-sm text-gray-600 dark:text-zinc-300 cursor-pointer">
                                <Paperclip size={16} />
                                {arquivo ? arquivo.name : 'Anexar comprovante (foto ou PDF)'}
                                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                                    onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                            </label>
                            <p className="text-xs text-gray-400">Com o comprovante anexado, fornecedor e valor são opcionais.</p>
                            {msg && <p className="text-sm text-blue-600">{msg}</p>}
                            <button disabled={enviando} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-60">
                                {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Enviar ao financeiro
                            </button>
                        </form>
                    )}

                    {aba === 'conciliar' && (
                        <div className="space-y-3">
                            <div className="flex gap-2 text-xs">
                                {([['PENDENTE', 'Pendentes'], ['CONCILIADO', 'Conciliados']] as const).map(([v, l]) => (
                                    <button key={v} onClick={() => setFiltro(v)}
                                        className={`px-3 py-1.5 rounded-full ${filtro === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300'}`}>{l}</button>
                                ))}
                            </div>

                {itens.some((i) => i.status === 'PENDENTE') && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button onClick={() => setMarcados(marcados.size ? new Set() : new Set(itens.filter((i) => i.status === 'PENDENTE').map((i) => i.id)))}
                            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300">
                            {marcados.size ? 'Desmarcar todos' : 'Selecionar todos'}
                        </button>
                        {marcados.size > 0 && (
                            <button onClick={descartarMarcados} className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-semibold">Descartar {marcados.size} selecionado(s)</button>
                        )}
                    </div>
                )}
                            {carregando && <p className="text-sm text-gray-400">Carregando...</p>}
                            {!carregando && itens.length === 0 && (
                                <p className="text-sm text-gray-400 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 text-center">Nenhum aviso aqui.</p>
                            )}

                            {itens.map((a) => (
                                <div key={a.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                                    {a.status === 'PENDENTE' && (
                                        <input type="checkbox" className="float-left mr-3 mt-1" checked={marcados.has(a.id)} onChange={() => alternar(a.id)} title="Selecionar para descartar" />
                                    )}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-white">
                                                {a.lojaNome
                                                    ? <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded border border-gray-300 dark:border-zinc-700 text-xs"><Store size={11} /> {a.lojaNome}{a.lojaPor === 'CNPJ' ? ' (pelo CNPJ)' : ''}</span>
                                                    : <span className="inline-block mr-2 px-2 py-0.5 rounded border border-dashed border-amber-400 text-amber-700 text-xs">Loja: escolher</span>}
                                                {a.categoriaNome && <span className="inline-block mr-2 px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-xs">{a.categoriaNome}</span>}
                                                {a.fornecedor}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                {dataBR(a.dataPagamento)} · avisado por {a.avisadoPorNome ?? '—'}{a.descricao ? ` · ${a.descricao}` : ''}
                                            </p>
                                        </div>
                                        <p className="font-bold text-gray-900 dark:text-white whitespace-nowrap">{a.valor > 0 ? moeda(a.valor) : 'ver comprovante'}</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {a.temComprovante && (
                                            <button onClick={() => verComprovante(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300">
                                                <FileText size={14} /> Comprovante
                                            </button>
                                        )}
                                        {a.status === 'PENDENTE' ? (
                                            <>
                                                <button onClick={() => abrir(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white">
                                                    <Link2 size={14} /> Conciliar
                                                </button>
                                                <button onClick={() => moverParaContas(a.id)} title="Não é comprovante — é boleto/nota a pagar" className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300">
                                                    <FileText size={14} /> É boleto/nota
                                                </button>
                                                <button onClick={() => descartar(a.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-500">
                                                    <Trash2 size={14} /> Descartar
                                                </button>
                                            </>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                                <CheckCircle2 size={14} /> Conciliado{a.conciliadoPor ? ` por ${a.conciliadoPor}` : ''}
                                                {a.observacaoFinanceiro ? ` — ${a.observacaoFinanceiro}` : ''}
                                            </span>
                                        )}
                                    </div>

                                </div>
                            ))}
                            {(() => {
                                const a = itens.find((i) => i.id === abertoId);
                                if (!a) return null;
                                return (
                                        <div className="fixed inset-0 z-50 bg-black/60 p-0 sm:p-3" onClick={fechar}>
                            <div className="h-full w-full rounded-none sm:rounded-2xl bg-white dark:bg-zinc-900 overflow-hidden grid grid-rows-[45vh_1fr] lg:grid-rows-1 lg:grid-cols-2" onClick={(ev) => ev.stopPropagation()}>
                                {/* Comprovante — sempre à esquerda */}
                                <div className="h-full min-h-0 bg-gray-100 dark:bg-zinc-950 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-zinc-800">
                                    {previewUrl ? (
                                        /pdf/.test(previewMime) ? (
                                            <iframe src={previewUrl} title="Comprovante" className="w-full h-full" />
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={previewUrl} alt="Comprovante" className="w-full h-full object-contain" />
                                        )
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-gray-400">
                                            {a.temComprovante ? <><Loader2 size={16} className="animate-spin mr-2" /> Abrindo o comprovante…</> : 'Sem comprovante anexado'}
                                        </div>
                                    )}
                                </div>
                                {/* Decisão — sempre à direita */}
                                <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-lg font-bold text-gray-900 dark:text-white truncate">{a.fornecedor}</p>
                                            <p className="text-xs text-gray-500">
                                                {a.valor > 0 ? moeda(a.valor) : 'valor —'} · pago {dataBR(a.dataPagamento)} · {a.lojaNome ?? 'sem loja'} · avisado por {a.avisadoPorNome ?? '—'}
                                            </p>
                                            {a.descricao && <p className="text-xs text-gray-500 mt-0.5">{a.descricao}</p>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {a.temComprovante && (
                                                <button type="button" onClick={() => verComprovante(a.id)} title="Abrir em outra aba" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><FileText size={18} /></button>
                                            )}
                                            <button type="button" onClick={fechar} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
                                        </div>
                                    </div>
                                            <div>
                                                <label className="text-xs font-semibold text-gray-500">Valor realmente pago (com juros, se houver)</label>
                                                <MoneyInput className={campo} placeholder="Ex: 1.250,00" value={valorPagoInput} onChange={(e) => setValorPagoInput(e.target.value)} />
                                            </div>
                                            <p className="text-xs font-semibold text-gray-500">Contas a pagar em aberto parecidas (dá baixa e anexa o comprovante):</p>
                                            {sugestoes.length === 0 && <p className="text-xs text-gray-400">Nenhuma conta em aberto parecida.</p>}
                                            {sugestoes.map((s) => (
                                                <div key={s.conta.id} className="flex items-center justify-between gap-2 text-sm">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-gray-900 dark:text-white">{s.conta.fornecedor ? `${s.conta.fornecedor} · ` : ''}{s.conta.descricao}</p>
                                                        <p className="text-xs text-gray-500">{dataBR(s.conta.vencimento)} · {moeda(s.conta.valor)}{s.conta.loja ? ` · ${s.conta.loja}` : ''}</p>
                                                        {numero(valorPagoInput) > s.conta.valor + 0.01 && (
                                                            <p className="text-xs font-semibold text-red-600">Juros + {moeda(numero(valorPagoInput) - s.conta.valor)}</p>
                                                        )}
                                                    </div>
                                                    <button onClick={() => conciliar(a.id, s.conta.id)} className="text-xs px-2.5 py-1.5 rounded-lg bg-green-600 text-white whitespace-nowrap">Baixar esta</button>
                                                </div>
                                            ))}
                                            <input className={campo} placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
                                            <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-3 space-y-2">
                                                <p className="text-xs font-semibold text-gray-500">Não existe a conta? Criar já paga:</p>
                                                <div className="grid sm:grid-cols-2 gap-2">
                                                    <select className={campo} value={lojaNova} onChange={(e) => setLojaNova(e.target.value)}>
                                                        <option value="">Loja…</option>
                                                        {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                                    </select>
                                                    <BillCategorySelect categories={categories} value={categoriaNova} onChange={setCategoriaNova} placeholder="Categoria" className={campo} />
                                                </div>
                                                <button onClick={() => conciliar(a.id, undefined, true)} disabled={!lojaNova} className="text-xs px-3 py-2 rounded-lg bg-green-600 text-white disabled:opacity-50">
                                                    Criar conta já paga
                                                </button>
                                            </div>
                                            <button onClick={() => conciliar(a.id)} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200">
                                                Só marcar como conciliado (sem vincular conta)
                                            </button>
                                        </div>
                                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-zinc-800">
                                        <button onClick={() => { fechar(); moverParaContas(a.id); }} className="text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200">É boleto/nota (mandar para Lançar contas)</button>
                                        <button onClick={() => { fechar(); descartar(a.id); }} className="text-xs px-3 py-2 rounded-lg text-red-500">Descartar</button>
                                    </div>
                                </div>
                            </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
