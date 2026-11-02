'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Inbox, Loader2, Mail, MessageCircle, PauseCircle, PlayCircle, Plus, RefreshCw, Store, Trash2, Unplug, XCircle, Filter } from 'lucide-react';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { canManagePaymentBatch, getUser } from '@/lib/auth';

// =============================================================================
// Financeiro → Recebimento automático. Conecta um ou mais WhatsApp (QR code,
// cada um atendendo uma ou várias lojas) e a caixa de e-mail dos boletos.
// Tudo que chega vira pendência em "Lançar contas" (boleto/nota) ou
// "Registrar pagamentos" (comprovante), na loja certa pelo CNPJ.
// =============================================================================

type Conexao = {
    id: string; nome: string; instancia: string; ativo: boolean; storeIds: string[];
    gruposPermitidos?: string[]; telefonesPermitidos?: string[]; aceitarPrivado?: boolean;
    ultimoEvento: string | null; ultimoErro: string | null; estado: string; numeroAtual: string | null; erro?: string;
};
type Email = { host: string; port: number; secure: boolean; usuario: string; ativo: boolean; storeIds: string[]; ultimoEvento: string | null; ultimoErro: string | null } | null;
type Status = {
    whatsappConfigurado: boolean;
    conexoes: Conexao[];
    email: Email;
    ultimas: {
        id: string; canal: 'WHATSAPP' | 'EMAIL'; storeId: string | null; remetente: string | null; nomeRemetente: string | null; assunto: string | null;
        arquivoNome: string | null; tipo: 'BOLETO_NOTA' | 'COMPROVANTE' | 'IGNORADO'; status: 'OK' | 'DUPLICADO' | 'ERRO' | 'IGNORADO'; mensagem: string | null; createdAt: string;
    }[];
};

const cartao = 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5';
const botao = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50';
const campo = 'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white';
const quando = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const erroMsg = (e: any, p: string) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m ?? p;
};

const ESTADO: Record<string, { txt: string; cor: string }> = {
    open: { txt: 'Conectado', cor: 'bg-emerald-100 text-emerald-800' },
    connecting: { txt: 'Aguardando leitura do QR code', cor: 'bg-amber-100 text-amber-800' },
    close: { txt: 'Desconectado', cor: 'bg-gray-100 text-gray-700' },
    nao_criada: { txt: 'Ainda não conectado', cor: 'bg-gray-100 text-gray-700' },
    sem_configuracao: { txt: 'Falta configurar no servidor', cor: 'bg-red-100 text-red-700' },
    erro: { txt: 'Serviço do WhatsApp fora do ar', cor: 'bg-red-100 text-red-700' },
};

function EscolherLojas({ lojas, valor, onChange }: { lojas: { id: string; name: string }[]; valor: string[]; onChange: (ids: string[]) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {lojas.map((l) => {
                const on = valor.includes(l.id);
                return (
                    <label key={l.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${on ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300'}`}>
                        <input type="checkbox" checked={on} onChange={() => onChange(on ? valor.filter((x) => x !== l.id) : [...valor, l.id])} />
                        {l.name}
                    </label>
                );
            })}
        </div>
    );
}

export default function RecebimentoAutomaticoPage() {
    const admin = canManagePaymentBatch(getUser());
    const [st, setSt] = useState<Status | null>(null);
    const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
    const [qr, setQr] = useState<{ id: string; qr: string } | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [nova, setNova] = useState<{ nome: string; storeIds: string[] } | null>(null);
    const [editando, setEditando] = useState<{ id: string; nome: string; storeIds: string[] } | null>(null);
    // Filtros: de quais grupos / telefones aceitar arquivos.
    const [filtros, setFiltros] = useState<{ id: string; grupos: string[]; telefones: string; privado: boolean; lista: { id: string; nome: string }[] | null; erro: string | null } | null>(null);
    async function abrirFiltros(c: Conexao) {
        setFiltros({ id: c.id, grupos: c.gruposPermitidos ?? [], telefones: (c.telefonesPermitidos ?? []).join('\n'), privado: c.aceitarPrivado !== false, lista: null, erro: null });
        try {
            const r = await api.get(`/recebimento-automatico/whatsapp/${c.id}/grupos`);
            setFiltros((f) => (f && f.id === c.id ? { ...f, lista: r.data ?? [] } : f));
        } catch (e: any) {
            setFiltros((f) => (f && f.id === c.id ? { ...f, lista: [], erro: e?.response?.data?.message ?? 'Não consegui listar os grupos.' } : f));
        }
    }
    const [emailForm, setEmailForm] = useState<{ host: string; port: string; usuario: string; senha: string; storeIds: string[] } | null>(null);

    const carregar = useCallback(async () => {
        const r = await api.get('/recebimento-automatico');
        setSt(r.data);
        setQr((q) => (q && r.data?.conexoes?.find((c: Conexao) => c.id === q.id)?.estado === 'open' ? null : q));
    }, []);
    useEffect(() => { carregar().catch((e) => setAviso(erroMsg(e, 'Não foi possível carregar.'))); }, [carregar]);
    useEffect(() => {
        api.get('/stores/switcher').then((r) => setLojas((Array.isArray(r.data) ? r.data : r.data?.items ?? []).map((s: any) => ({ id: s.id, name: s.name })))).catch(() => { });
    }, []);

    // Enquanto o QR está na tela, confere a cada 4s se já conectou.
    useEffect(() => {
        if (!qr) return;
        const t = setInterval(() => { carregar().catch(() => { }); }, 4000);
        return () => clearInterval(t);
    }, [qr, carregar]);

    async function acao(nome: string, fn: () => Promise<void>) {
        setOcupado(nome); setAviso(null);
        try { await fn(); } catch (e: any) { setAviso(erroMsg(e, 'Não foi possível concluir.')); } finally { setOcupado(null); }
    }

    const nomeLojas = (ids: string[]) => (ids.length ? ids.map((id) => lojas.find((l) => l.id === id)?.name ?? '?').join(', ') : 'Todas as lojas (pelo CNPJ)');

    if (!st) return <AppLayout title="Recebimento automático"><div className="py-16 text-center text-gray-500">{aviso ?? <><Loader2 className="inline animate-spin" /> Carregando…</>}</div></AppLayout>;
    const em = st.email;

    return (
        <AppLayout title="Recebimento automático">
            <div className="space-y-5">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recebimento automático</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        Boletos, notas e comprovantes que chegam pelo <b>WhatsApp do financeiro</b> ou pelo <b>e-mail dos boletos</b> entram sozinhos no sistema, na loja certa (pelo CNPJ do documento) — e ficam esperando alguém conferir:
                        boleto/nota em <Link href="/bills/lancar" className="text-blue-600 hover:underline">Lançar contas</Link>,
                        comprovante em <Link href="/bills/pagamentos" className="text-blue-600 hover:underline">Registrar pagamentos</Link>.
                    </p>
                </div>
                {aviso && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">{aviso}</div>}

                <div className="grid lg:grid-cols-2 gap-4">
                    {/* WhatsApp */}
                    <div className={`${cartao} space-y-3`}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><MessageCircle size={18} className="text-emerald-600" /> WhatsApp do financeiro</p>
                            {admin && st.whatsappConfigurado && !nova && (
                                <button onClick={() => setNova({ nome: '', storeIds: [] })} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white"><Plus size={14} /> Conectar um número</button>
                            )}
                        </div>
                        {!st.whatsappConfigurado && (
                            <p className="text-sm text-gray-600 dark:text-zinc-300">Falta configurar no servidor: defina <code>EVOLUTION_API_URL</code>, <code>EVOLUTION_API_KEY</code> e <code>WEBHOOK_BASE_URL</code> no <code>.env</code> do backend e reinicie.</p>
                        )}
                        {nova && (
                            <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/30 p-3 space-y-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Novo número</p>
                                <input className={campo} placeholder="Nome (ex: WhatsApp boletos Savassi)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
                                <p className="text-xs text-gray-500">Lojas que usam este número (nenhuma marcada = todas; o CNPJ do documento decide a loja):</p>
                                <EscolherLojas lojas={lojas} valor={nova.storeIds} onChange={(ids) => setNova({ ...nova, storeIds: ids })} />
                                <div className="flex gap-2">
                                    <button disabled={!!ocupado} onClick={() => acao('nova', async () => {
                                        const r = await api.post('/recebimento-automatico/whatsapp', nova);
                                        setNova(null);
                                        if (r.data?.qr) setQr({ id: r.data.id, qr: r.data.qr });
                                        await carregar();
                                    })} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white disabled:opacity-50">
                                        {ocupado === 'nova' ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} Criar e mostrar QR code
                                    </button>
                                    <button onClick={() => setNova(null)} className={botao}>Cancelar</button>
                                </div>
                            </div>
                        )}
                        {st.conexoes.length === 0 && !nova && st.whatsappConfigurado && <p className="text-sm text-gray-500">Nenhum número conectado ainda.</p>}
                        {st.conexoes.map((c) => {
                            const est = ESTADO[c.estado] ?? ESTADO.close;
                            return (
                                <div key={c.id} className="rounded-xl border border-gray-200 dark:border-zinc-700 p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-gray-900 dark:text-white">{c.nome}</p>
                                            <p className="text-xs text-gray-500 flex items-center gap-1"><Store size={12} /> {nomeLojas(c.storeIds)}</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${est.cor}`}>{c.ativo ? est.txt : 'Pausado'}</span>
                                    </div>
                                    {c.numeroAtual && <p className="text-sm text-gray-700 dark:text-zinc-200">Número: <b>+{c.numeroAtual}</b></p>}
                                    <p className="text-xs text-gray-500">Última mensagem tratada: {quando(c.ultimoEvento)}{c.ultimoErro ? ` · erro: ${c.ultimoErro}` : ''}</p>
                                    <p className="text-xs text-gray-500">
                                        Aceita arquivos de: {c.gruposPermitidos?.length ? `${c.gruposPermitidos.length} grupo(s) marcado(s)` : 'qualquer grupo'}
                                        {c.aceitarPrivado === false ? ' · sem conversa privada' : ' · conversa privada'}
                                        {c.telefonesPermitidos?.length ? ` · só ${c.telefonesPermitidos.length} telefone(s) autorizado(s)` : ' · qualquer pessoa'}
                                    </p>
                                    {filtros?.id === c.id && (
                                        <div className="rounded-lg bg-gray-50 dark:bg-zinc-950 p-3 space-y-3 text-sm">
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">Grupos que contam</p>
                                                <p className="text-xs text-gray-500">Marque só os grupos onde mandam boletos/comprovantes. Nenhum marcado = todos os grupos.</p>
                                                {filtros.lista === null ? (
                                                    <p className="text-xs text-gray-400 mt-1"><Loader2 size={12} className="inline animate-spin" /> Buscando os grupos…</p>
                                                ) : filtros.erro ? (
                                                    <p className="text-xs text-red-600 mt-1">{filtros.erro}</p>
                                                ) : filtros.lista.length === 0 ? (
                                                    <p className="text-xs text-gray-400 mt-1">Esse número não está em nenhum grupo.</p>
                                                ) : (
                                                    <div className="mt-1 max-h-56 overflow-y-auto space-y-1">
                                                        {filtros.lista.map((g) => (
                                                            <label key={g.id} className="flex items-center gap-2 text-gray-700 dark:text-zinc-200">
                                                                <input type="checkbox" checked={filtros.grupos.includes(g.id)}
                                                                    onChange={(e) => setFiltros({ ...filtros, grupos: e.target.checked ? [...filtros.grupos, g.id] : filtros.grupos.filter((x) => x !== g.id) })} />
                                                                {g.nome}
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <label className="flex items-center gap-2 text-gray-700 dark:text-zinc-200">
                                                <input type="checkbox" checked={filtros.privado} onChange={(e) => setFiltros({ ...filtros, privado: e.target.checked })} />
                                                Aceitar arquivos mandados em conversa privada para o número
                                            </label>
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">Telefones autorizados (opcional)</p>
                                                <p className="text-xs text-gray-500">Um por linha, com DDD. Preenchido = só arquivos dessas pessoas contam (nos grupos marcados e no privado). Vazio = qualquer pessoa.</p>
                                                <textarea className={`${campo} mt-1 h-24 font-mono`} value={filtros.telefones} onChange={(e) => setFiltros({ ...filtros, telefones: e.target.value })} placeholder={'31 99999-0000\n31 98888-1111'} />
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => acao('filtros', async () => {
                                                    await api.patch(`/recebimento-automatico/whatsapp/${c.id}`, {
                                                        gruposPermitidos: filtros.grupos,
                                                        aceitarPrivado: filtros.privado,
                                                        telefonesPermitidos: filtros.telefones.split(/[\n,;]+/).map((t) => t.trim()).filter(Boolean),
                                                    });
                                                    setFiltros(null);
                                                    await carregar();
                                                })} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Salvar filtros</button>
                                                <button onClick={() => setFiltros(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-600">Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                    {qr?.id === c.id && (
                                        <div className="rounded-xl border border-gray-200 dark:border-zinc-700 p-3 flex flex-col sm:flex-row gap-4 items-center">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={qr.qr.startsWith('data:') ? qr.qr : `data:image/png;base64,${qr.qr}`} alt="QR code do WhatsApp" className="w-56 h-56 bg-white rounded-lg" />
                                            <ol className="text-sm text-gray-600 dark:text-zinc-300 list-decimal pl-5 space-y-1">
                                                <li>No celular do número, abra o WhatsApp.</li>
                                                <li>Toque em <b>⋮ → Dispositivos conectados → Conectar dispositivo</b>.</li>
                                                <li>Aponte a câmera para este QR code.</li>
                                                <li>Esta tela muda para <b>Conectado</b> sozinha.</li>
                                            </ol>
                                        </div>
                                    )}
                                    {editando?.id === c.id && (
                                        <div className="rounded-lg bg-gray-50 dark:bg-zinc-950 p-2 space-y-2">
                                            <input className={campo} value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
                                            <EscolherLojas lojas={lojas} valor={editando.storeIds} onChange={(ids) => setEditando({ ...editando, storeIds: ids })} />
                                            <div className="flex gap-2">
                                                <button onClick={() => acao('ed', async () => { await api.patch(`/recebimento-automatico/whatsapp/${c.id}`, { nome: editando.nome, storeIds: editando.storeIds }); setEditando(null); await carregar(); })} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Salvar</button>
                                                <button onClick={() => setEditando(null)} className="px-3 py-1.5 rounded-lg text-xs text-gray-600">Cancelar</button>
                                            </div>
                                        </div>
                                    )}
                                    {admin && (
                                        <div className="flex flex-wrap gap-2">
                                            {c.estado !== 'open' && (
                                                <button disabled={!!ocupado} onClick={() => acao(`qr-${c.id}`, async () => { const r = await api.post(`/recebimento-automatico/whatsapp/${c.id}/conectar`); setQr(r.data?.qr ? { id: c.id, qr: r.data.qr } : null); await carregar(); })}
                                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white disabled:opacity-50">
                                                    {ocupado === `qr-${c.id}` ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />} {qr?.id === c.id ? 'Gerar novo QR code' : 'Conectar (mostrar QR code)'}
                                                </button>
                                            )}
                                            {c.estado === 'open' && (
                                                <button disabled={!!ocupado} title="Reaplica o endereço de retorno (webhook) e libera mensagens de grupo, sem desconectar"
                                                    onClick={() => acao(`cfg-${c.id}`, async () => { await api.post(`/recebimento-automatico/whatsapp/${c.id}/conectar`); await carregar(); alert('Configuração reaplicada. Mande um arquivo de teste de OUTRO número.'); })} className={botao}>
                                                    {ocupado === `cfg-${c.id}` ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reaplicar configuração
                                                </button>
                                            )}
                                            {c.estado === 'open' && (
                                                <button disabled={!!ocupado} onClick={() => acao(`sair-${c.id}`, async () => { if (!confirm('Desconectar este WhatsApp? Depois é só ler o QR code com o mesmo número ou com outro.')) return; await api.post(`/recebimento-automatico/whatsapp/${c.id}/desconectar`); await carregar(); })} className={`${botao} !text-red-600`}>
                                                    <Unplug size={15} /> Desconectar / trocar número
                                                </button>
                                            )}
                                            <button disabled={!!ocupado} onClick={() => acao(`pausa-${c.id}`, async () => { await api.patch(`/recebimento-automatico/whatsapp/${c.id}`, { ativo: !c.ativo }); await carregar(); })} className={botao}>
                                                {c.ativo ? <><PauseCircle size={15} /> Pausar</> : <><PlayCircle size={15} /> Retomar</>}
                                            </button>
                                            <button onClick={() => setEditando({ id: c.id, nome: c.nome, storeIds: c.storeIds })} className={botao}><Store size={15} /> Lojas</button>
                                            <button onClick={() => (filtros?.id === c.id ? setFiltros(null) : abrirFiltros(c))} className={botao}><Filter size={15} /> Grupos e telefones</button>
                                            <button disabled={!!ocupado} onClick={() => acao(`del-${c.id}`, async () => { if (!confirm('Excluir esta conexão de WhatsApp?')) return; await api.delete(`/recebimento-automatico/whatsapp/${c.id}`); await carregar(); })} className={`${botao} !text-red-600`}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <p className="text-xs text-gray-500">
                            Funciona em conversa e em <b>grupo</b> (pode ser um grupo só para todas as lojas). Cada PDF ou foto é registrado e o número responde confirmando, com a loja.
                            A loja sai do <b>CNPJ do pagador/destinatário</b> no documento; se não tiver, do nome da loja escrito na legenda (ex.: &quot;Raiz&quot;); se ainda assim não der, o número pergunta &quot;de qual loja é?&quot; e é só responder com o número ou o nome.
                            Foto ou PDF escaneado sem legenda: a leitura automática decide se é boleto/nota ou comprovante. Fotos que não são boleto/nota/comprovante (produto, oferta, print) e conversa normal são ignoradas. Em <b>Grupos e telefones</b> dá pra escolher de quais grupos e de quem aceitar. Integração não oficial: se desconectar, é só ler o QR code de novo.
                        </p>
                    </div>

                    {/* E-mail */}
                    <div className={`${cartao} space-y-3`}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Mail size={18} className="text-blue-600" /> E-mail dos boletos</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${!em ? 'bg-gray-100 text-gray-700' : em.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
                                {!em ? 'Não configurado' : em.ativo ? 'Ativo (a cada 5 min)' : 'Desligado'}
                            </span>
                        </div>
                        {em && (
                            <>
                                <p className="text-sm text-gray-700 dark:text-zinc-200">Caixa: <b>{em.usuario}</b> <span className="text-xs text-gray-500">({em.host}:{em.port})</span></p>
                                <p className="text-xs text-gray-500 flex items-center gap-1"><Store size={12} /> {nomeLojas(em.storeIds)}</p>
                                <p className="text-xs text-gray-500">Última leitura: {quando(em.ultimoEvento)}{em.ultimoErro ? ` · erro: ${em.ultimoErro}` : ''}</p>
                            </>
                        )}
                        {emailForm && (
                            <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 p-3 space-y-2">
                                <div className="grid grid-cols-[1fr_90px] gap-2">
                                    <input className={campo} placeholder="Servidor IMAP (ex: imap.hostinger.com)" value={emailForm.host} onChange={(e) => setEmailForm({ ...emailForm, host: e.target.value })} />
                                    <input className={campo} placeholder="Porta" value={emailForm.port} onChange={(e) => setEmailForm({ ...emailForm, port: e.target.value })} />
                                </div>
                                <input className={campo} placeholder="E-mail (ex: boletos@empresa.com.br)" value={emailForm.usuario} onChange={(e) => setEmailForm({ ...emailForm, usuario: e.target.value })} />
                                <input className={campo} type="password" placeholder={em ? 'Senha (deixe em branco pra manter)' : 'Senha da caixa'} value={emailForm.senha} onChange={(e) => setEmailForm({ ...emailForm, senha: e.target.value })} />
                                <p className="text-xs text-gray-500">Lojas desta caixa (nenhuma marcada = todas; o CNPJ decide):</p>
                                <EscolherLojas lojas={lojas} valor={emailForm.storeIds} onChange={(ids) => setEmailForm({ ...emailForm, storeIds: ids })} />
                                <div className="flex gap-2">
                                    <button disabled={!!ocupado} onClick={() => acao('em-salvar', async () => {
                                        await api.put('/recebimento-automatico/email', { host: emailForm.host, port: Number(emailForm.port) || 993, usuario: emailForm.usuario, senha: emailForm.senha || undefined, storeIds: emailForm.storeIds, ativo: true });
                                        setEmailForm(null); await carregar();
                                    })} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">Salvar</button>
                                    <button onClick={() => setEmailForm(null)} className={botao}>Cancelar</button>
                                </div>
                            </div>
                        )}
                        {admin && !emailForm && (
                            <div className="flex flex-wrap gap-2">
                                <button onClick={() => setEmailForm({ host: em?.host ?? '', port: String(em?.port ?? 993), usuario: em?.usuario ?? '', senha: '', storeIds: em?.storeIds ?? [] })}
                                    className={em ? botao : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white'}>
                                    <Mail size={15} /> {em ? 'Alterar' : 'Configurar caixa de e-mail'}
                                </button>
                                {em && (
                                    <button disabled={!!ocupado} onClick={() => acao('em-ativo', async () => { await api.put('/recebimento-automatico/email', { ativo: !em.ativo }); await carregar(); })} className={botao}>
                                        {em.ativo ? <><PauseCircle size={15} /> Desligar</> : <><PlayCircle size={15} /> Ligar</>}
                                    </button>
                                )}
                                {em?.ativo && (
                                    <button disabled={!!ocupado} onClick={() => acao('em-ler', async () => {
                                        const r = await api.post('/recebimento-automatico/email/verificar');
                                        if (!r.data.ok) setAviso(r.data.erro);
                                        else alert(`${r.data.emails} e-mail(s) lido(s), ${r.data.anexos} anexo(s) registrado(s).`);
                                        await carregar();
                                    })} className={botao}>
                                        {ocupado === 'em-ler' ? <Loader2 size={15} className="animate-spin" /> : <Inbox size={15} />} Ler a caixa agora
                                    </button>
                                )}
                                {em && (
                                    <button disabled={!!ocupado} onClick={() => acao('em-del', async () => { if (!confirm('Remover a caixa de e-mail?')) return; await api.delete('/recebimento-automatico/email'); await carregar(); })} className={`${botao} !text-red-600`}><Trash2 size={15} /></button>
                                )}
                            </div>
                        )}
                        <p className="text-xs text-gray-500">Lê os e-mails <b>não lidos</b>, pega os anexos (PDF, XML de nota ou foto), registra e marca o e-mail como lido. Logo/assinatura do e-mail é ignorada. A senha fica guardada cifrada.</p>
                    </div>
                </div>

                <div className={`${cartao} !p-0 overflow-x-auto`}>
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-zinc-800">
                        <p className="font-semibold text-gray-900 dark:text-white">Últimos recebidos</p>
                        <button onClick={() => carregar()} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"><RefreshCw size={12} /> Atualizar</button>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-gray-500">
                            <tr><th className="px-5 py-2">Quando</th><th className="px-3 py-2">De</th><th className="px-3 py-2">Arquivo</th><th className="px-3 py-2">Loja</th><th className="px-3 py-2">Virou</th><th className="px-3 py-2">Resultado</th></tr>
                        </thead>
                        <tbody>
                            {st.ultimas.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">Nada recebido ainda.</td></tr>}
                            {st.ultimas.map((u) => (
                                <tr key={u.id} className="border-t border-gray-100 dark:border-zinc-800 align-top">
                                    <td className="px-5 py-2 whitespace-nowrap text-gray-500">{quando(u.createdAt)}<div className="text-[11px]">{u.canal === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</div></td>
                                    <td className="px-3 py-2 text-gray-900 dark:text-white">{u.nomeRemetente || u.remetente || '—'}{u.nomeRemetente && u.remetente && <div className="text-[11px] text-gray-500">{u.remetente}</div>}</td>
                                    <td className="px-3 py-2 text-gray-700 dark:text-zinc-200 break-all">{u.arquivoNome ?? '—'}{u.assunto && <div className="text-[11px] text-gray-500">{u.assunto}</div>}</td>
                                    <td className="px-3 py-2 text-xs">{u.storeId ? lojas.find((l) => l.id === u.storeId)?.name ?? '—' : <span className="text-amber-600">a escolher</span>}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                        {u.tipo === 'IGNORADO'
                                            ? <span className="text-gray-400">—</span>
                                            : u.tipo === 'COMPROVANTE'
                                                ? <Link href="/bills/pagamentos" className="text-blue-600 hover:underline">Comprovante</Link>
                                                : <Link href="/bills/lancar" className="text-blue-600 hover:underline">Boleto / nota</Link>}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${u.status === 'OK' ? 'text-emerald-600' : u.status === 'DUPLICADO' ? 'text-amber-600' : u.status === 'IGNORADO' ? 'text-gray-400' : 'text-red-600'}`}>
                                            {u.status === 'OK' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                            {u.status === 'OK' ? 'Registrado' : u.status === 'DUPLICADO' ? 'Já tinha sido enviado' : u.status === 'IGNORADO' ? 'Ignorado' : 'Erro'}
                                        </span>
                                        {u.mensagem && <div className="text-[11px] text-gray-500">{u.mensagem}</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppLayout>
    );
}
