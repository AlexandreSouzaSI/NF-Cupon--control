'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, Link2, Loader2, Pin, RefreshCw, Save, Trash2, Undo2, Wand2, X } from 'lucide-react';

import { AppLayout } from '../../../src/components/app-layout';
import { ClassificadorExtrato } from '../../../src/components/bills/ClassificadorExtrato';
import { Modal } from '../../../src/components/bills/Modal';
import { BILL_CATEGORY_GROUPS, OTHER_GROUP, groupTone } from '../../../src/components/bills/BillCategorySelect';
import { SituacaoConciliacao, dataHora, erroMsg, type ResumoConciliacao } from '../../../src/components/bills/conciliacao-comum';
import { api } from '@/lib/api';
import { FIXOS, moeda, nomeMes, totaisExtrato, type CategoriaOpcao, type ItemExtrato, type Parte } from '@/lib/extrato';

type Vinculo = { id: string; termo: string; destino: string };
type Detalhe = ResumoConciliacao & {
    totalRecebimentos: number; nRecebimentos: number; saldoAnterior: number | null; saldoFinal: number | null;
    token: string | null; aplicadoPor: string | null; itens: ItemExtrato[]; categorias: CategoriaOpcao[]; vinculos: Vinculo[];
    lancados: { quantidade: number; total: number; baixas: number };
};

const cartao = 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl';
const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50';
const grupoDe = (c?: CategoriaOpcao) => (c && BILL_CATEGORY_GROUPS.some((g) => g.key === c.group) ? (c.group as string) : 'OUTRAS');

export default function ConciliacaoExtratoDetalhePage() {
    const params = useParams();
    const id = String(params?.id ?? '');
    const router = useRouter();
    const [d, setD] = useState<Detalhe | null>(null);
    const [erroCarga, setErroCarga] = useState(false);
    const [itens, setItens] = useState<ItemExtrato[]>([]);
    const [alterados, setAlterados] = useState<Set<string>>(new Set());
    const [pendentesBase, setPendentesBase] = useState<Set<string>>(new Set());
    const [desvinc, setDesvinc] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [modalAplicar, setModalAplicar] = useState(false);
    const [vinculoDe, setVinculoDe] = useState<ItemExtrato | null | 'lista'>(null);

    const carregar = useCallback(async () => {
        const r = await api.get(`/conciliacao-extrato/${id}`);
        const det = r.data as Detalhe;
        setD(det);
        const lista = det.itens.map((i) => ({ ...i, partes: (i.partes as Parte[]) ?? [] }));
        setItens(lista);
        setPendentesBase(new Set(lista.filter((i) => !i.partes.length).map((i) => i.id)));
        setAlterados(new Set());
        setDesvinc(new Set());
    }, [id]);
    useEffect(() => { carregar().catch(() => setErroCarga(true)); }, [carregar]);

    // Atualiza sozinho quando volta pra aba (ex.: o link acabou de ser respondido), se não houver nada por salvar.
    useEffect(() => {
        const f = () => { if (!alterados.size && document.visibilityState === 'visible') carregar().catch(() => { }); };
        document.addEventListener('visibilitychange', f);
        return () => document.removeEventListener('visibilitychange', f);
    }, [alterados, carregar]);

    useEffect(() => {
        const f = (e: BeforeUnloadEvent) => { if (alterados.size) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', f);
        return () => window.removeEventListener('beforeunload', f);
    }, [alterados]);

    const onChange = useCallback((itemId: string, mud: { partes?: Parte[]; nota?: string }) => {
        setItens((l) => l.map((i) => (i.id === itemId ? { ...i, ...(mud.partes !== undefined ? { partes: mud.partes, origem: mud.partes.length ? 'MANUAL' : null, motivo: null } : {}), ...(mud.nota !== undefined ? { nota: mud.nota } : {}) } : i)));
        setAlterados((s) => new Set(s).add(itemId));
    }, []);

    const onDesvincular = useCallback((itemId: string) => {
        setItens((l) => l.map((i) => (i.id === itemId ? { ...i, billId: null } : i)));
        setDesvinc((s) => new Set(s).add(itemId));
        setAlterados((s) => new Set(s).add(itemId));
    }, []);

    async function salvar() {
        if (!alterados.size) return true;
        setOcupado('salvar');
        try {
            const payload = itens.filter((i) => alterados.has(i.id)).map((i) => ({ id: i.id, partes: i.partes, nota: i.nota ?? '', ...(desvinc.has(i.id) ? { desvincular: true } : {}) }));
            await api.patch(`/conciliacao-extrato/${id}/itens`, { itens: payload });
            await carregar();
            return true;
        } catch (e: any) {
            alert(erroMsg(e, 'Não foi possível salvar.'));
            return false;
        } finally {
            setOcupado(null);
        }
    }

    async function acao(nome: string, fn: () => Promise<unknown>) {
        setOcupado(nome);
        try { await fn(); } catch (e: any) { alert(erroMsg(e, 'Não foi possível concluir.')); } finally { setOcupado(null); }
    }

    const urlLink = d?.token && typeof window !== 'undefined' ? `${window.location.origin}/conciliar-extrato/${d.token}` : '';
    const t = useMemo(() => totaisExtrato(itens), [itens]);

    if (erroCarga) return <AppLayout title="Conciliação do Extrato"><div className="py-16 text-center text-gray-500">Conciliação não encontrada.</div></AppLayout>;
    if (!d) return <AppLayout title="Conciliação do Extrato"><div className="py-16 text-center text-gray-500"><Loader2 className="inline animate-spin" /> Carregando…</div></AppLayout>;

    // Resumo do Aplicar: novas contas por grupo, baixas em contas que já existiam.
    const catDe = new Map(d.categorias.map((c) => [c.id, c]));
    const novas = itens.filter((i) => !i.billId);
    const porGrupo: Record<string, number> = {};
    for (const it of novas) for (const p of it.partes) if (catDe.has(p.k)) porGrupo[grupoDe(catDe.get(p.k))] = (porGrupo[grupoDe(catDe.get(p.k))] ?? 0) + p.v;
    const totalNovas = Math.round(Object.values(porGrupo).reduce((s, v) => s + v, 0) * 100) / 100;
    const comConta = itens.filter((i) => i.billId && i.partes.length);
    const valorComConta = Math.round(comConta.reduce((s, i) => s + i.valor, 0) * 100) / 100;
    const grupos = [...BILL_CATEGORY_GROUPS.map((g) => ({ key: g.key as string, label: g.label })), { key: 'OUTRAS', label: OTHER_GROUP.label }];

    return (
        <AppLayout title="Conciliação do Extrato">
            <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <Link href="/conciliacao-extrato" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"><ArrowLeft size={14} /> Conciliações</Link>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Extrato {nomeMes(d.mes)}{d.lojaNome ? ` — ${d.lojaNome}` : ''}</h1>
                        <p className="text-xs text-gray-500">{d.banco ?? ''} · {d.arquivos.join(' + ')} · <SituacaoConciliacao c={d} /></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => salvar()} disabled={!alterados.size || !!ocupado} className={`${botao} ${alterados.size ? '!bg-blue-600 !text-white !border-blue-600' : ''}`}>
                            {ocupado === 'salvar' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar{alterados.size ? ` (${alterados.size})` : ''}
                        </button>
                        <button onClick={() => setModalAplicar(true)} disabled={!!ocupado} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                            <CheckCircle2 size={15} /> {d.status === 'APLICADA' ? 'Aplicar de novo' : 'Aplicar em Contas a Pagar'}
                        </button>
                    </div>
                </div>

                {d.linkEnviadoEm && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-500/10 dark:border-violet-500/30 px-4 py-2 text-sm text-violet-800 dark:text-violet-200">
                        Classificação recebida pelo link{d.linkEnviadoPor ? ` (${d.linkEnviadoPor})` : ''} em {dataHora(d.linkEnviadoEm)}. Os itens marcados &quot;pelo link&quot; já estão nos cards — confira e dê OK em &quot;Aplicar em Contas a Pagar&quot;.
                    </div>
                )}
                {d.status === 'APLICADA' && d.pendenteReaplicar && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle size={16} /> A classificação mudou depois de aplicada. Clique em &quot;Aplicar de novo&quot; para atualizar Contas a Pagar.
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className={`${cartao} p-3 space-y-2 lg:col-span-2 min-w-0`}>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Link2 size={15} /> Link para classificar (sem login)</p>
                        <p className="text-xs text-gray-500">Quem abrir vê só os pagamentos deste extrato e pode classificar e enviar. O que for enviado aparece aqui na hora.</p>
                        {d.token ? (
                            <div className="flex gap-2">
                                <input readOnly value={urlLink} onFocus={(e) => e.target.select()} className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200" />
                                <button onClick={() => { navigator.clipboard?.writeText(urlLink); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }} className="px-3 rounded-lg bg-blue-600 text-white text-sm whitespace-nowrap">{copiado ? 'Copiado!' : 'Copiar'}</button>
                                <button onClick={() => acao('link', async () => { if (confirm('Desativar o link? Quem estiver com ele não consegue mais enviar.')) { await api.delete(`/conciliacao-extrato/${id}/link`); await carregar(); } })} className="px-2 text-xs text-red-500">Desativar</button>
                            </div>
                        ) : (
                            <button onClick={() => acao('link', async () => { if (!(await salvar())) return; await api.post(`/conciliacao-extrato/${id}/link`); await carregar(); })} disabled={!!ocupado} className={botao}>
                                <Link2 size={15} /> Gerar link
                            </button>
                        )}
                    </div>
                    <div className={`${cartao} p-3 space-y-2 min-w-0`}>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Ferramentas</p>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setVinculoDe('lista')} className={botao}><Pin size={15} /> Vínculos ({d.vinculos.length})</button>
                            <button onClick={() => acao('auto', async () => { if (!(await salvar())) return; const r = await api.post(`/conciliacao-extrato/${id}/reclassificar`); await carregar(); alert(`${r.data.classificados} pagamento(s) classificados automaticamente.`); })} disabled={!!ocupado} className={botao} title="Refaz os automáticos e os pendentes com os vínculos e contas de agora. Não mexe no que você ou o link classificaram.">
                                <Wand2 size={15} /> Reclassificar automático
                            </button>
                            <button onClick={() => { if (alterados.size && !confirm('Descartar as alterações não salvas?')) return; carregar(); }} className={botao}><RefreshCw size={15} /> Atualizar</button>
                            {d.status === 'APLICADA' && (
                                <button onClick={() => acao('desfazer', async () => { if (confirm('Desfazer? As contas criadas por esta conciliação são apagadas e as que levaram baixa voltam a ficar em aberto.')) { await api.post(`/conciliacao-extrato/${id}/desfazer`); await carregar(); } })} className={botao}><Undo2 size={15} /> Desfazer aplicação</button>
                            )}
                            <button onClick={() => acao('excluir', async () => { if (confirm(`Excluir esta conciliação?${d.lancados.quantidade || d.lancados.baixas ? ' O que ela lançou em Contas a Pagar também é desfeito.' : ''}`)) { await api.delete(`/conciliacao-extrato/${id}`); router.push('/conciliacao-extrato'); } })} className={`${botao} !text-red-600`}><Trash2 size={15} /> Excluir</button>
                        </div>
                        {d.status === 'APLICADA' && <p className="text-xs text-gray-500">Em Contas a Pagar: {d.lancados.quantidade} contas criadas ({moeda(d.lancados.total)}) · {d.lancados.baixas} baixas.</p>}
                    </div>
                </div>

                <ClassificadorExtrato
                    itens={itens}
                    categorias={d.categorias}
                    totalPagamentos={d.totalPagamentos}
                    nPagamentos={d.nPagamentos}
                    totalRecebimentos={d.totalRecebimentos}
                    saldoAnterior={d.saldoAnterior}
                    saldoFinal={d.saldoFinal}
                    alterados={alterados}
                    onChange={onChange}
                    onDesvincular={onDesvincular}
                    pendentesBase={pendentesBase}
                    onVincular={(it) => setVinculoDe(it)}
                />
            </div>

            {modalAplicar && (
                <Modal onFechar={() => setModalAplicar(false)}>
                    <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="font-semibold text-gray-900 dark:text-white">Aplicar em Contas a Pagar — {nomeMes(d.mes)}</p>
                            <button onClick={() => setModalAplicar(false)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
                        </div>
                        <p className="text-sm text-gray-500">
                            Os pagamentos que já existiam em Contas a Pagar ({comConta.length}, {moeda(valorComConta)}) levam baixa na data do extrato (se ainda estavam em aberto).
                            Os outros viram contas <b>já pagas</b>, cada uma na sua categoria:{d.status === 'APLICADA' ? ' o que esta conciliação tinha lançado antes é substituído.' : ''}
                        </p>
                        <div className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {grupos.filter((g) => (porGrupo[g.key] ?? 0) > 0).map((g) => (
                                <div key={g.key} className="flex items-center justify-between py-1.5 text-sm">
                                    <span className={`px-2 py-0.5 rounded border text-xs font-bold ${g.key === 'OUTRAS' ? groupTone(null) : groupTone(g.key)}`}>{g.label}</span>
                                    <span className="tabular-nums text-gray-900 dark:text-white">{moeda(porGrupo[g.key])}</span>
                                </div>
                            ))}
                            <div className="flex items-center justify-between py-2 text-sm font-bold text-gray-900 dark:text-white"><span>Contas novas (já pagas)</span><span className="tabular-nums">{moeda(totalNovas)}</span></div>
                        </div>
                        <p className="text-xs text-gray-500">
                            Não entram: {Object.entries(FIXOS).map(([k, f]) => `${f.curto} ${moeda(t.por[k]?.tot ?? 0)}`).join(' · ')}.
                        </p>
                        {t.nPend > 0 && (
                            <p className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> Ainda há {t.nPend} pagamentos pendentes ({moeda(t.pendente)}). Eles ficam de fora até serem classificados — dá pra aplicar de novo depois.</p>
                        )}
                        <button disabled={!!ocupado} onClick={() => acao('aplicar', async () => {
                            if (!(await salvar())) return;
                            const r = await api.post(`/conciliacao-extrato/${id}/aplicar`);
                            setModalAplicar(false);
                            await carregar();
                            alert(`Pronto: ${r.data.criadas} contas criadas (${moeda(r.data.total)}) e ${r.data.baixas} baixas em Contas a Pagar.`);
                        })} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
                            {ocupado === 'aplicar' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} OK, aplicar em Contas a Pagar
                        </button>
                    </div>
                </Modal>
            )}

            {vinculoDe && (
                <VinculosModal
                    categorias={d.categorias}
                    vinculos={d.vinculos}
                    item={vinculoDe === 'lista' ? null : vinculoDe}
                    onFechar={() => setVinculoDe(null)}
                    onMudou={async () => {
                        const r = await api.get('/conciliacao-extrato/vinculos/lista');
                        setD((x) => (x ? { ...x, vinculos: r.data } : x));
                    }}
                />
            )}
        </AppLayout>
    );
}

function VinculosModal({ categorias, vinculos, item, onFechar, onMudou }: {
    categorias: CategoriaOpcao[]; vinculos: Vinculo[]; item: ItemExtrato | null; onFechar: () => void; onMudou: () => Promise<void>;
}) {
    const sugestaoTermo = item ? item.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/).slice(0, 3).join(' ') : '';
    const [termo, setTermo] = useState(sugestaoTermo);
    const [destino, setDestino] = useState(item?.partes.length === 1 && item.partes[0].k !== 'JA_LANCADO' ? item.partes[0].k : '');
    const [erro, setErro] = useState<string | null>(null);
    const [lote, setLote] = useState('');
    const [resLote, setResLote] = useState<{ salvos: number; erros: string[] } | null>(null);
    const rotulo = (k: string) => categorias.find((c) => c.id === k)?.name ?? FIXOS[k]?.curto ?? '(categoria removida)';
    const cor = (k: string) => FIXOS[k]?.cor ?? groupTone(categorias.find((c) => c.id === k)?.group);
    const campo = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white';
    const grupos = [...BILL_CATEGORY_GROUPS.map((g) => ({ key: g.key as string, label: g.label })), { key: 'OUTRAS', label: OTHER_GROUP.label }];

    async function salvar() {
        setErro(null);
        try {
            await api.post('/conciliacao-extrato/vinculos', { termo, destino });
            setTermo(''); await onMudou();
        } catch (e: any) { setErro(erroMsg(e, 'Não foi possível salvar.')); }
    }
    async function salvarLote() {
        setResLote(null);
        try {
            const r = await api.post('/conciliacao-extrato/vinculos/lote', { texto: lote });
            setResLote(r.data);
            if (!r.data.erros.length) setLote('');
            await onMudou();
        } catch (e: any) { setResLote({ salvos: 0, erros: [erroMsg(e, 'Não foi possível salvar.')] }); }
    }

    return (
        <Modal onFechar={onFechar}>
            <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 dark:text-white">Vínculos automáticos</p>
                    <button onClick={onFechar} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800"><X size={18} /></button>
                </div>
                <p className="text-xs text-gray-500">
                    Ensine o sistema uma vez e ele usa todo mês: um nome que aparece no extrato vai sempre para a mesma categoria
                    (ex.: <i>JOAO DA SILVA → Freelancer</i>, <i>DISTRIBUIDORA X → Cervejas</i>). Vale para os próximos extratos e para o botão &quot;Reclassificar automático&quot;.
                </p>
                {item && <p className="text-xs rounded-lg bg-gray-50 dark:bg-zinc-950 px-3 py-2 text-gray-600 dark:text-zinc-300">Pagamento: <b>{item.nome}</b> {item.descricao && `— ${item.descricao}`}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2">
                    <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome no extrato (ex: JOAO DA SILVA)" className={campo} />
                    <select value={destino} onChange={(e) => setDestino(e.target.value)} className={campo}>
                        <option value="">Vai para…</option>
                        {grupos.map((g) => {
                            const cs = categorias.filter((c) => (BILL_CATEGORY_GROUPS.some((x) => x.key === c.group) ? c.group : 'OUTRAS') === g.key);
                            return cs.length ? <optgroup key={g.key} label={g.label}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null;
                        })}
                        <option value="NAO">Não é despesa</option>
                    </select>
                    <button onClick={salvar} disabled={termo.trim().length < 3 || !destino} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Salvar</button>
                </div>
                {erro && <p className="text-sm text-red-600">{erro}</p>}
                {!item && (
                    <details className="rounded-lg border border-gray-200 dark:border-zinc-800 px-3 py-2">
                        <summary className="text-sm font-semibold text-gray-900 dark:text-white cursor-pointer">Colar vários de uma vez</summary>
                        <p className="text-xs text-gray-500 mt-2">Um por linha: <code>NOME → CATEGORIA</code> (também vale <code>=</code> ou <code>;</code>). Categoria = o nome dela (ex.: <code>Luz</code>, <code>Freelancer</code>) ou <code>NAO</code>. Linha começando com # é ignorada.</p>
                        <textarea value={lote} onChange={(e) => setLote(e.target.value)} rows={8} placeholder={'CEMIG → Luz\nJOAO DA SILVA → Freelancer\nDISTRIBUIDORA X → Cervejas'}
                            className="mt-2 w-full px-3 py-2 rounded-lg text-sm font-mono bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white" />
                        <button onClick={salvarLote} disabled={!lote.trim()} className="mt-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Salvar todos</button>
                        {resLote && (
                            <div className="mt-2 text-xs space-y-0.5">
                                <p className="text-emerald-600 font-semibold">{resLote.salvos} vínculo(s) salvos.</p>
                                {resLote.erros.map((er) => <p key={er} className="text-red-600">{er}</p>)}
                            </div>
                        )}
                    </details>
                )}
                <div className="divide-y divide-gray-100 dark:divide-zinc-800 max-h-72 overflow-y-auto">
                    {vinculos.length === 0 && <p className="text-sm text-gray-500 py-3">Nenhum vínculo ainda.</p>}
                    {vinculos.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 py-1.5 text-sm">
                            <span className="flex-1 font-semibold text-gray-900 dark:text-white">{v.termo}</span>
                            <span className="text-gray-400">→</span>
                            <span className={`px-2 py-0.5 rounded border text-xs font-bold ${cor(v.destino)}`}>{rotulo(v.destino)}</span>
                            <button onClick={async () => { await api.delete(`/conciliacao-extrato/vinculos/${v.id}`); await onMudou(); }} className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
