'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Paperclip, Plus, Store, Trash2, Upload, X } from 'lucide-react';

import { AppLayout } from '../../../src/components/app-layout';
import { AbasContas } from '../../../src/components/bills/AbasContas';
import { BillCategorySelect, useBillCategories } from '../../../src/components/bills/BillCategorySelect';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { canManagePaymentBatch, getUser } from '@/lib/auth';
import { MoneyInput } from '../../../src/components/ui/MoneyInput';

// =============================================================================
// Lançar Contas — boletos e notas enviados (por aqui, pelo link da loja, pelo
// WhatsApp ou pelo e-mail) chegam como PENDENTES com os dados lidos do
// documento e a loja achada pelo CNPJ. O financeiro confere, corrige, divide
// em parcelas se precisar e lança: aí vira conta(s) a pagar.
// =============================================================================

const campo =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-gray-400';
const rotulo = 'text-xs font-medium text-gray-500 dark:text-zinc-400 block mb-1';
const moeda = (v: number | null | undefined) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (v: string | null | undefined) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—');
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
const somarMeses = (iso: string, meses: number) => {
    const [a, m, d] = iso.split('-').map(Number);
    const ultimo = new Date(a, m - 1 + meses + 1, 0).getDate();
    const dt = new Date(a, m - 1 + meses, Math.min(d, ultimo));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const erroMsg = (e: any, padrao: string) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m ?? padrao;
};

const TIPOS_DOC: Record<string, string> = { BOLETO: 'Boleto', NFE: 'NF-e', NFSE: 'NFS-e', OUTRO: 'Documento' };
const ORIGEM: Record<string, string> = { TELA: 'pela tela', LINK: 'pelo link', WHATSAPP: 'pelo WhatsApp', EMAIL: 'pelo e-mail' };
const TIPOS_CONTA = [
    { value: 'BOLETO', label: 'Boleto' },
    { value: 'PIX', label: 'Pix' },
    { value: 'CARD', label: 'Cartão' },
    { value: 'NO_BILL', label: 'Sem boleto' },
];
const FORMAS_PAGAMENTO = [
    { value: 'BANK_SLIP', label: 'Boleto' },
    { value: 'PIX', label: 'Pix' },
    { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
    { value: 'DEBIT_CARD', label: 'Cartão de débito' },
    { value: 'CASH', label: 'Dinheiro' },
    { value: 'BANK_TRANSFER', label: 'Transferência' },
    { value: 'COMPANY_ACCOUNT', label: 'Conta da empresa' },
];

type Envio = {
    id: string;
    storeId: string | null;
    lojaPor: string | null;
    lojaNome: string | null;
    arquivoNome: string | null;
    arquivoMime: string | null;
    tipoDocumento: string | null;
    fornecedor: string | null;
    fornecedorDoc: string | null;
    valor: number | null;
    vencimento: string | null;
    emissao: string | null;
    numeroDocumento: string | null;
    codigoBarras: string | null;
    chaveNfe: string | null;
    descricao: string | null;
    parcelas: { vencimento: string; valor: number; numero?: string }[] | null;
    categoryId: string | null;
    categoriaNome: string | null;
    observacaoEnvio: string | null;
    enviadoPorNome: string | null;
    origem: string | null;
    status: 'PENDENTE' | 'LANCADA' | 'DESCARTADA';
    billIds: string[];
    lancadoEm: string | null;
    lancadoPor: string | null;
    motivoDescarte: string | null;
    createdAt: string;
    temArquivo: boolean;
};

type Parecida = { id: string; descricao: string; valor: number; vencimento: string; status: string; mesmoCodigo: boolean; fornecedor: string | null; loja: string | null };
type Parcela = { valor: string; vencimento: string };
type Form = {
    storeId: string; fornecedor: string; descricao: string; categoryId: string;
    tipo: string; formaPagamento: string; codigoBarras: string; observacao: string; parcelas: Parcela[];
};

const formDe = (e: Envio): Form => ({
    storeId: e.storeId ?? '',
    fornecedor: e.fornecedor ?? '',
    descricao: e.descricao ?? (e.numeroDocumento ? `${TIPOS_DOC[e.tipoDocumento ?? 'OUTRO']} ${e.numeroDocumento}` : ''),
    categoryId: e.categoryId ?? '',
    tipo: e.tipoDocumento === 'BOLETO' || e.codigoBarras ? 'BOLETO' : 'NO_BILL',
    formaPagamento: e.tipoDocumento === 'BOLETO' || e.codigoBarras ? 'BANK_SLIP' : 'PIX',
    codigoBarras: e.codigoBarras ?? '',
    observacao: '',
    parcelas: e.parcelas?.length
        ? e.parcelas.map((p) => ({ valor: p.valor.toFixed(2).replace('.', ','), vencimento: p.vencimento }))
        : [{ valor: e.valor ? e.valor.toFixed(2).replace('.', ',') : '', vencimento: e.vencimento ?? hojeISO() }],
});

export default function LancarContasPage() {
    const loja = getActiveStore();
    const podeLink = canManagePaymentBatch(getUser());
    const { categories } = useBillCategories({ seedDefaults: true });

    // ---------- Link (por loja) ----------
    const [token, setToken] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const urlLink = token && typeof window !== 'undefined' ? `${window.location.origin}/enviar-conta/${token}` : '';
    useEffect(() => {
        const id = getActiveStore()?.id;
        if (podeLink && id) api.get('/contas-entrada/contas/link', { params: { storeId: id } }).then((r) => setToken(r.data.token)).catch(() => { });
    }, [podeLink]);
    async function gerarLink() {
        if (token && !confirm('Gerar um novo link vai desativar o anterior. Continuar?')) return;
        const r = await api.post('/contas-entrada/contas/link', { storeId: getActiveStore()?.id });
        setToken(r.data.token);
    }
    async function desativarLink() {
        if (!confirm('Desativar o link? Quem tem o link deixa de conseguir enviar.')) return;
        await api.delete('/contas-entrada/contas/link', { params: { storeId: getActiveStore()?.id } });
        setToken(null);
    }
    async function copiar() {
        await navigator.clipboard.writeText(urlLink);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    }

    // ---------- Cadastros ----------
    const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
    const [fornecedores, setFornecedores] = useState<{ id: string; name: string }[]>([]);
    useEffect(() => {
        api.get('/stores/switcher').then((r) => setLojas((Array.isArray(r.data) ? r.data : r.data?.items ?? []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => { });
        api.get('/suppliers').then((r) => setFornecedores(Array.isArray(r.data) ? r.data : r.data?.items ?? [])).catch(() => { });
    }, []);

    // ---------- Envio pela própria tela ----------
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [envCategoria, setEnvCategoria] = useState('');
    const [envObs, setEnvObs] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [msgEnvio, setMsgEnvio] = useState<string | null>(null);

    // ---------- Lista ----------
    const [filtro, setFiltro] = useState<'PENDENTE' | 'LANCADA' | 'DESCARTADA'>('PENDENTE');
    const [itens, setItens] = useState<Envio[]>([]);
    const [carregando, setCarregando] = useState(false);
    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await api.get('/contas-entrada/contas', { params: { status: filtro, storeId: getActiveStore()?.id || undefined } });
            setItens(r.data ?? []);
        } catch {
            setItens([]);
        } finally {
            setCarregando(false);
        }
    }, [filtro]);
    useEffect(() => { carregar(); }, [carregar]);

    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        if (!arquivo) return;
        setEnviando(true); setMsgEnvio(null);
        try {
            const fd = new FormData();
            fd.append('file', arquivo);
            const id = getActiveStore()?.id;
            if (id) fd.append('storeId', id);
            if (envCategoria) fd.append('categoryId', envCategoria);
            if (envObs.trim()) fd.append('observacao', envObs.trim());
            await api.post('/contas-entrada/contas', fd);
            setArquivo(null); setEnvCategoria(''); setEnvObs('');
            setMsgEnvio('Documento enviado. Confira abaixo e lance.');
            if (filtro === 'PENDENTE') carregar(); else setFiltro('PENDENTE');
        } catch (err: any) {
            setMsgEnvio(erroMsg(err, 'Não foi possível enviar.'));
        } finally {
            setEnviando(false);
        }
    }

    // ---------- Conferência ----------
    const [abertoId, setAbertoId] = useState<string | null>(null);
    const [form, setForm] = useState<Form | null>(null);
    const [parecidas, setParecidas] = useState<Parecida[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [lancando, setLancando] = useState(false);
    const [nParcelas, setNParcelas] = useState('2');

    async function abrirArquivo(id: string, nova = true) {
        const r = await api.get(`/contas-entrada/contas/${id}/arquivo`, { responseType: 'blob' });
        const url = URL.createObjectURL(r.data);
        if (nova) window.open(url, '_blank');
        return url;
    }

    async function conferir(e: Envio) {
        if (abertoId === e.id) { fechar(); return; }
        setAbertoId(e.id); setForm(formDe(e)); setParecidas([]);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        api.get(`/contas-entrada/contas/${e.id}/parecidas`).then((r) => setParecidas(r.data ?? [])).catch(() => { });
        if (e.temArquivo && /pdf|image/.test(e.arquivoMime ?? '')) {
            try { setPreviewUrl(await abrirArquivo(e.id, false)); } catch { /* sem preview */ }
        }
    }

    function fechar() {
        setAbertoId(null); setForm(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
    }

    const set = (campoNome: keyof Form, valor: any) => setForm((f) => (f ? { ...f, [campoNome]: valor } : f));
    const setParcela = (i: number, k: keyof Parcela, v: string) =>
        setForm((f) => (f ? { ...f, parcelas: f.parcelas.map((p, j) => (j === i ? { ...p, [k]: v } : p)) } : f));

    function dividir(envio: Envio) {
        if (!form) return;
        const n = Math.max(1, Math.min(60, Math.round(Number(nParcelas) || 1)));
        const total = form.parcelas.reduce((s, p) => s + numero(p.valor), 0) || envio.valor || 0;
        const base = Math.floor((total / n) * 100) / 100;
        const primeiro = form.parcelas[0]?.vencimento || envio.vencimento || hojeISO();
        set('parcelas', Array.from({ length: n }, (_, i) => {
            const v = i === n - 1 ? total - base * (n - 1) : base;
            return { valor: v.toFixed(2).replace('.', ','), vencimento: somarMeses(primeiro, i) };
        }));
    }

    async function lancar(envio: Envio) {
        if (!form) return;
        setLancando(true);
        try {
            const r = await api.patch(`/contas-entrada/contas/${envio.id}/lancar`, {
                ...form,
                parcelas: form.parcelas.map((p) => ({ valor: numero(p.valor), vencimento: p.vencimento })),
            });
            alert(`${r.data.criadas} conta${r.data.criadas === 1 ? '' : 's'} a pagar criada${r.data.criadas === 1 ? '' : 's'}.`);
            fechar();
            carregar();
        } catch (err: any) {
            alert(erroMsg(err, 'Não foi possível lançar.'));
        } finally {
            setLancando(false);
        }
    }

    async function descartar(envio: Envio) {
        const motivo = prompt('Descartar este envio? Motivo (opcional):');
        if (motivo === null) return;
        await api.patch(`/contas-entrada/contas/${envio.id}/descartar`, { motivo });
        fechar();
        carregar();
    }

    const totalParcelas = form?.parcelas.reduce((s, p) => s + numero(p.valor), 0) ?? 0;

    return (
        <AppLayout title="Lançar Contas">
            <div className="space-y-5">
                <AbasContas ativa="lancar" />
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lançar Contas</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        Boletos e notas enviados chegam aqui com os dados lidos do documento e a loja achada pelo CNPJ. Confira, ajuste, divida em parcelas se precisar e lance em{' '}
                        <Link href="/bills" className="text-blue-600 hover:underline">Contas a Pagar</Link>. Também chegam pelo WhatsApp e pelo e-mail — veja{' '}
                        <Link href="/recebimento-automatico" className="text-blue-600 hover:underline">Recebimento automático</Link>.
                    </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                    {podeLink && (
                        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Link para enviar boletos e notas (sem login){loja ? ` — ${loja.name}` : ''}</p>
                            <p className="text-xs text-gray-500">Mande por WhatsApp. Quem abrir só consegue enviar documentos — não vê mais nada do sistema. Cada loja tem o seu link (o CNPJ do documento continua mandando, se for de outra loja).</p>
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

                    <form onSubmit={enviar} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Enviar daqui</p>
                        <label className="flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 text-sm text-gray-600 dark:text-zinc-300 cursor-pointer">
                            <Paperclip size={16} />
                            {arquivo ? arquivo.name : 'Anexar boleto ou nota (PDF, XML ou foto)'}
                            <input type="file" accept="image/*,application/pdf,.xml,text/xml" className="hidden" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
                        </label>
                        <BillCategorySelect categories={categories} value={envCategoria} onChange={setEnvCategoria} placeholder="Categoria (opcional)" className={campo} />
                        <input className={campo} placeholder="Observação (opcional)" value={envObs} onChange={(e) => setEnvObs(e.target.value)} />
                        {msgEnvio && <p className="text-sm text-blue-600">{msgEnvio}</p>}
                        <button disabled={enviando || !arquivo} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Enviar e ler documento
                        </button>
                    </form>
                </div>

                <div className="flex gap-2 text-xs">
                    {([['PENDENTE', 'A conferir'], ['LANCADA', 'Lançadas'], ['DESCARTADA', 'Descartadas']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => { fechar(); setFiltro(v); }}
                            className={`px-3 py-1.5 rounded-full ${filtro === v ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300'}`}>{l}</button>
                    ))}
                </div>

                {carregando && <p className="text-sm text-gray-400">Carregando...</p>}
                {!carregando && itens.length === 0 && (
                    <p className="text-sm text-gray-400 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 text-center">Nada aqui.</p>
                )}

                {itens.map((e) => (
                    <div key={e.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white">
                                    <span className="inline-block mr-2 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs">{TIPOS_DOC[e.tipoDocumento ?? 'OUTRO']}</span>
                                    {e.lojaNome
                                        ? <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded border border-gray-300 dark:border-zinc-700 text-xs"><Store size={11} /> {e.lojaNome}{e.lojaPor === 'CNPJ' ? ' (pelo CNPJ)' : ''}</span>
                                        : <span className="inline-block mr-2 px-2 py-0.5 rounded border border-dashed border-amber-400 text-amber-700 text-xs">Loja: escolher</span>}
                                    {e.categoriaNome && <span className="inline-block mr-2 px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-xs">{e.categoriaNome}</span>}
                                    {e.fornecedor ?? <span className="text-gray-400">Fornecedor não identificado</span>}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Venc. {dataBR(e.vencimento)}{e.parcelas?.length ? ` · ${e.parcelas.length} parcelas` : ''}{e.descricao ? ` · ${e.descricao}` : ''}
                                </p>
                                <p className="text-xs text-gray-400">
                                    Enviado {e.origem ? `${ORIGEM[e.origem] ?? ''} ` : ''}em {new Date(e.createdAt).toLocaleString('pt-BR')}{e.enviadoPorNome ? ` por ${e.enviadoPorNome}` : ''}
                                    {e.observacaoEnvio ? ` · "${e.observacaoEnvio}"` : ''}
                                </p>
                            </div>
                            <p className="font-bold text-gray-900 dark:text-white whitespace-nowrap">{e.valor ? moeda(e.valor) : 'ver documento'}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            {e.temArquivo && (
                                <button onClick={() => abrirArquivo(e.id)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-300">
                                    <FileText size={14} /> Ver documento
                                </button>
                            )}
                            {e.status === 'PENDENTE' ? (
                                <>
                                    <button onClick={() => conferir(e)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white">
                                        {abertoId === e.id ? <><X size={14} /> Fechar</> : <><CheckCircle2 size={14} /> Conferir e lançar</>}
                                    </button>
                                    <button onClick={() => descartar(e)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-red-500">
                                        <Trash2 size={14} /> Descartar
                                    </button>
                                </>
                            ) : e.status === 'LANCADA' ? (
                                <span className="inline-flex items-center gap-1 text-xs text-green-600">
                                    <CheckCircle2 size={14} /> {e.billIds.length} conta{e.billIds.length === 1 ? '' : 's'} lançada{e.billIds.length === 1 ? '' : 's'}
                                    {e.lancadoEm ? ` em ${new Date(e.lancadoEm).toLocaleDateString('pt-BR')}` : ''}{e.lancadoPor ? ` por ${e.lancadoPor}` : ''}
                                </span>
                            ) : (
                                <span className="text-xs text-gray-500">Descartado{e.motivoDescarte ? ` — ${e.motivoDescarte}` : ''}</span>
                            )}
                        </div>

                        {abertoId === e.id && form && (
                            <div className={`mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 grid gap-4 ${previewUrl ? 'xl:grid-cols-2' : ''}`}>
                                {previewUrl && (
                                    <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-zinc-800 bg-gray-50 min-h-[420px]">
                                        {/pdf/.test(e.arquivoMime ?? '') ? (
                                            <iframe src={previewUrl} title="Documento" className="w-full h-[560px]" />
                                        ) : (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={previewUrl} alt="Documento" className="w-full object-contain max-h-[560px]" />
                                        )}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    {parecidas.length > 0 && (
                                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                                            <p className="font-semibold flex items-center gap-1"><AlertTriangle size={14} /> Pode já estar lançada:</p>
                                            {parecidas.map((p) => (
                                                <p key={p.id}>
                                                    {p.mesmoCodigo && <strong>Mesmo código de barras · </strong>}
                                                    {p.fornecedor ? `${p.fornecedor} · ` : ''}{p.descricao} · {moeda(p.valor)} · venc. {dataBR(p.vencimento)}{p.loja ? ` · ${p.loja}` : ''}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className={rotulo}>Loja *</label>
                                            <select className={campo} value={form.storeId} onChange={(ev) => set('storeId', ev.target.value)}>
                                                <option value="">Escolher a loja…</option>
                                                {lojas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                                            </select>
                                            {e.lojaPor === 'CNPJ' && <p className="text-[11px] text-emerald-600 mt-0.5">Achada pelo CNPJ no documento.</p>}
                                        </div>
                                        <div>
                                            <label className={rotulo}>Categoria</label>
                                            <BillCategorySelect categories={categories} value={form.categoryId} onChange={(v) => set('categoryId', v)} placeholder="—" className={campo} />
                                        </div>
                                        <div>
                                            <label className={rotulo}>Fornecedor</label>
                                            <input className={campo} list="lc-fornecedores" value={form.fornecedor} onChange={(ev) => set('fornecedor', ev.target.value)} placeholder="Nome do fornecedor" />
                                            <datalist id="lc-fornecedores">{fornecedores.map((f) => <option key={f.id} value={f.name} />)}</datalist>
                                            {e.fornecedorDoc && <p className="text-[11px] text-gray-400 mt-0.5">CNPJ/CPF no documento: {e.fornecedorDoc}</p>}
                                        </div>
                                        <div>
                                            <label className={rotulo}>Descrição *</label>
                                            <input className={campo} value={form.descricao} onChange={(ev) => set('descricao', ev.target.value)} placeholder="Ex: Cervejas Ambev — NF 1234" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                                            <div>
                                                <label className={rotulo}>Tipo de conta</label>
                                                <select className={campo} value={form.tipo} onChange={(ev) => set('tipo', ev.target.value)}>
                                                    {TIPOS_CONTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={rotulo}>Forma de pagamento</label>
                                                <select className={campo} value={form.formaPagamento} onChange={(ev) => set('formaPagamento', ev.target.value)}>
                                                    {FORMAS_PAGAMENTO.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className={rotulo}>Código de barras / linha digitável</label>
                                            <input className={`${campo} font-mono`} value={form.codigoBarras} onChange={(ev) => set('codigoBarras', ev.target.value)} />
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-gray-200 dark:border-zinc-800 p-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Parcelas ({form.parcelas.length})</p>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-gray-500">Dividir em</span>
                                                <input className={`${campo} !w-16 !py-1`} type="number" min="1" max="60" value={nParcelas} onChange={(ev) => setNParcelas(ev.target.value)} />
                                                <span className="text-xs text-gray-500">mensais</span>
                                                <button type="button" onClick={() => dividir(e)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200">Aplicar</button>
                                            </div>
                                        </div>
                                        {form.parcelas.map((p, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400 w-8">{i + 1}ª</span>
                                                <MoneyInput className={campo} placeholder="Valor" value={p.valor} onChange={(ev) => setParcela(i, 'valor', ev.target.value)} />
                                                <input className={campo} type="date" value={p.vencimento} onChange={(ev) => setParcela(i, 'vencimento', ev.target.value)} />
                                                <button type="button" disabled={form.parcelas.length === 1} onClick={() => set('parcelas', form.parcelas.filter((_, j) => j !== i))}
                                                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <button type="button"
                                                onClick={() => {
                                                    const ult = form.parcelas[form.parcelas.length - 1];
                                                    set('parcelas', [...form.parcelas, { valor: ult?.valor ?? '', vencimento: ult?.vencimento ? somarMeses(ult.vencimento, 1) : hojeISO() }]);
                                                }}
                                                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200">
                                                <Plus size={14} /> Parcela
                                            </button>
                                            <p className="text-xs text-gray-500">
                                                Total: <strong className="text-gray-900 dark:text-white">{moeda(totalParcelas)}</strong>
                                                {e.valor && Math.abs(totalParcelas - e.valor) > 0.01 && (
                                                    <span className="ml-2 text-amber-600">documento: {moeda(e.valor)} (diferença {moeda(totalParcelas - e.valor)})</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={rotulo}>Observação</label>
                                        <input className={campo} value={form.observacao} onChange={(ev) => set('observacao', ev.target.value)} placeholder="Opcional" />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => lancar(e)} disabled={lancando || !form.descricao.trim() || !form.storeId}
                                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
                                            {lancando ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                            Lançar {form.parcelas.length > 1 ? `${form.parcelas.length} contas` : 'conta'} a pagar
                                        </button>
                                        <button onClick={fechar} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800">Cancelar</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </AppLayout>
    );
}
