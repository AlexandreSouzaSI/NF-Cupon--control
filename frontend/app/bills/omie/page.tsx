'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudDownload, KeyRound, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';

// =============================================================================
// Integração Omie → Contas a Pagar: um card por bar, com o App Key / App
// Secret do Omie daquele CNPJ e o botão "Buscar tudo do Omie".
// =============================================================================

type Resultado = {
    status: 'RODANDO' | 'OK' | 'ERRO';
    etapa?: string;
    inicio: string;
    fim?: string;
    erro?: string;
    contasNoOmie?: number;
    criadas?: number;
    atualizadas?: number;
    vinculadasPlanilha?: number;
    removidas?: number;
    pagas?: number;
    emAberto?: number;
    canceladas?: number;
    comCodigoBarras?: number;
    comPix?: number;
    fornecedoresNovos?: number;
    categoriasNovas?: number;
    avisos?: string[];
    camposConta?: string[];
    camposMovimento?: string[];
};

type Loja = {
    storeId: string;
    nome: string;
    cnpj: string | null;
    configurado: boolean;
    appKey: string | null;
    empresaOmie: string | null;
    ultimaSincronizacao: string | null;
    rodando: boolean;
    resultado: Resultado | null;
    contasDoOmie: number;
};

const campo =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-gray-400';

const dataHora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-';

function Numero({ rotulo, valor, tom = 'cinza' }: { rotulo: string; valor?: number; tom?: 'cinza' | 'verde' | 'azul' | 'ambar' | 'vermelho' }) {
    if (valor === undefined) return null;
    const cores = {
        cinza: 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300',
        verde: 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400',
        azul: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
        ambar: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
        vermelho: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${cores[tom]}`}>
            <b className="font-bold">{valor.toLocaleString('pt-BR')}</b> {rotulo}
        </span>
    );
}

function CardLoja({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
    const [appKey, setAppKey] = useState(loja.appKey ?? '');
    const [appSecret, setAppSecret] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [iniciando, setIniciando] = useState(false);
    const [limparAntigas, setLimparAntigas] = useState(true);
    const [aviso, setAviso] = useState<string | null>(null);
    const [editando, setEditando] = useState(!loja.configurado);

    useEffect(() => { setAppKey(loja.appKey ?? ''); }, [loja.appKey]);

    const r = loja.resultado;
    const rodando = loja.rodando || iniciando;

    async function salvar() {
        try {
            setSalvando(true);
            setAviso(null);
            const res = await api.put(`/integracoes/omie/${loja.storeId}`, { appKey, appSecret });
            setAppSecret('');
            setAviso(res.data?.aviso ?? null);
            toast.success(`Chaves do Omie salvas${res.data?.empresaOmie ? ` — ${res.data.empresaOmie}` : ''}.`);
            if (!res.data?.aviso) setEditando(false);
            aoMudar();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Não consegui salvar as chaves.');
        } finally {
            setSalvando(false);
        }
    }

    async function buscar() {
        const msg = limparAntigas
            ? `Buscar todas as contas a pagar do Omie para ${loja.nome}?\n\nAs contas em aberto que não estão no Omie (da planilha importada antes) serão removidas. Contas pagas aqui continuam pagas.`
            : `Buscar todas as contas a pagar do Omie para ${loja.nome}?`;
        if (!confirm(msg)) return;
        try {
            setIniciando(true);
            await api.post(`/integracoes/omie/${loja.storeId}/sincronizar`, { limparAntigas });
            toast.success('Busca iniciada — pode demorar alguns minutos.');
            aoMudar();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Não consegui iniciar a busca.');
        } finally {
            setIniciando(false);
        }
    }

    async function remover() {
        if (!confirm(`Remover as chaves do Omie de ${loja.nome}? As contas já trazidas continuam aqui.`)) return;
        try {
            await api.delete(`/integracoes/omie/${loja.storeId}`);
            setAppKey('');
            setEditando(true);
            aoMudar();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Não consegui remover.');
        }
    }

    return (
        <div className="p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{loja.nome}</h2>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">CNPJ {loja.cnpj || '-'}</p>
                </div>
                {loja.configurado ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-500/10 text-xs font-medium text-green-700 dark:text-green-400">
                        <CheckCircle2 size={14} /> Conectado{loja.empresaOmie ? ` — ${loja.empresaOmie}` : ''}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-500 dark:text-zinc-400">
                        <KeyRound size={14} /> Sem chaves do Omie
                    </span>
                )}
            </div>

            {editando ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="text-xs text-gray-500 dark:text-zinc-400 space-y-1">
                        <span>App Key</span>
                        <input className={campo} value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="ex.: 6675091658235" autoComplete="off" />
                    </label>
                    <label className="text-xs text-gray-500 dark:text-zinc-400 space-y-1">
                        <span>App Secret</span>
                        <input className={campo} type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
                            placeholder={loja.configurado ? '•••••••• (guardado — preencha só pra trocar)' : 'cole o App Secret'} autoComplete="new-password" />
                    </label>
                    <div className="flex gap-2">
                        <button onClick={salvar} disabled={salvando || !appKey || (!loja.configurado && !appSecret)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap">
                            {salvando ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                            Testar e salvar
                        </button>
                        {loja.configurado && (
                            <button onClick={() => { setEditando(false); setAppSecret(''); setAppKey(loja.appKey ?? ''); }}
                                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-sm text-gray-600 dark:text-zinc-300">
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-zinc-300">
                    <span>App Key <b>{loja.appKey}</b> · App Secret guardado</span>
                    <button onClick={() => setEditando(true)} className="text-xs text-blue-600 hover:underline">Trocar chaves</button>
                    <button onClick={remover} className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"><Trash2 size={12} /> Remover</button>
                </div>
            )}

            {aviso && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {aviso}
                </div>
            )}

            {loja.configurado && (
                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 dark:border-zinc-800">
                    <label className="flex items-start gap-2 pt-3 text-xs text-gray-600 dark:text-zinc-400 max-w-xl">
                        <input type="checkbox" className="mt-0.5" checked={limparAntigas} onChange={(e) => setLimparAntigas(e.target.checked)} />
                        <span>Remover as contas <b>em aberto</b> que não estão no Omie (as da planilha importada antes e as excluídas no Omie). Contas pagas nunca são apagadas.</span>
                    </label>
                    <button onClick={buscar} disabled={rodando}
                        className="mt-3 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition whitespace-nowrap">
                        {rodando ? <Loader2 size={16} className="animate-spin" /> : <CloudDownload size={16} />}
                        {rodando ? 'Buscando…' : 'Buscar tudo do Omie'}
                    </button>
                </div>
            )}

            {loja.rodando && r?.etapa && (
                <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
                    <Loader2 size={14} className="animate-spin" /> {r.etapa}
                </p>
            )}

            {r && !loja.rodando && r.status === 'ERRO' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-400">
                    A última busca falhou ({dataHora(r.fim || r.inicio)}): {r.erro}
                </div>
            )}

            {r && r.status === 'OK' && !loja.rodando && (
                <div className="space-y-2">
                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                        Última busca: {dataHora(loja.ultimaSincronizacao || r.fim)} · {loja.contasDoOmie.toLocaleString('pt-BR')} conta(s) daqui ligadas ao Omie
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        <Numero rotulo="no Omie" valor={r.contasNoOmie} tom="azul" />
                        <Numero rotulo="novas" valor={r.criadas} tom="verde" />
                        <Numero rotulo="atualizadas" valor={r.atualizadas} />
                        {!!r.vinculadasPlanilha && <Numero rotulo="ligadas às da planilha" valor={r.vinculadasPlanilha} />}
                        {!!r.removidas && <Numero rotulo="removidas" valor={r.removidas} tom="vermelho" />}
                        <Numero rotulo="pagas" valor={r.pagas} tom="verde" />
                        <Numero rotulo="em aberto" valor={r.emAberto} tom="ambar" />
                        {!!r.canceladas && <Numero rotulo="canceladas" valor={r.canceladas} />}
                        <Numero rotulo="com código de barras" valor={r.comCodigoBarras} />
                        <Numero rotulo="com chave PIX" valor={r.comPix} />
                        {!!r.fornecedoresNovos && <Numero rotulo="fornecedores novos" valor={r.fornecedoresNovos} />}
                        {!!r.categoriasNovas && <Numero rotulo="categorias novas" valor={r.categoriasNovas} />}
                    </div>
                </div>
            )}

            {r?.avisos && r.avisos.length > 0 && !loja.rodando && (
                <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400 list-disc pl-5">
                    {r.avisos.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
            )}

            {r && (r.camposConta?.length || r.camposMovimento?.length) && !loja.rodando ? (
                <details className="text-xs text-gray-500 dark:text-zinc-500">
                    <summary className="cursor-pointer">Campos que o Omie mandou (diagnóstico)</summary>
                    <p className="mt-1 break-words"><b>Conta:</b> {r.camposConta?.join(', ') || '-'}</p>
                    <p className="mt-1 break-words"><b>Pagamento:</b> {r.camposMovimento?.join(', ') || '-'}</p>
                </details>
            ) : null}
        </div>
    );
}

export default function OmiePage() {
    const router = useRouter();
    const [lojas, setLojas] = useState<Loja[]>([]);
    const [carregando, setCarregando] = useState(true);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    async function carregar() {
        try {
            const res = await api.get('/integracoes/omie');
            setLojas(res.data ?? []);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Erro ao carregar a integração com o Omie.');
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => { carregar(); }, []);

    // Enquanto alguma busca roda, atualiza a tela a cada 2,5 s.
    const algumaRodando = lojas.some((l) => l.rodando);
    useEffect(() => {
        if (!algumaRodando) return;
        timer.current = setTimeout(carregar, 2500);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [lojas, algumaRodando]);

    return (
        <AppLayout title="Omie">
            <div className="space-y-6">
                <div>
                    <button onClick={() => router.push('/bills')}
                        className="mb-2 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition">
                        <ArrowLeft size={16} /> Voltar para Contas a Pagar
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buscar contas do Omie</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        Cada bar usa o App Key e o App Secret do seu CNPJ no Omie (Omie → Configurações → Meus Aplicativos).
                        O botão traz todas as contas a pagar — pagas, em aberto e canceladas — com fornecedor, categoria, código de barras,
                        chave PIX e dados bancários do fornecedor. Pode clicar quantas vezes quiser: atualiza, não duplica.
                    </p>
                </div>

                {carregando ? (
                    <p className="text-sm text-gray-400">Carregando…</p>
                ) : lojas.length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhuma loja encontrada.</p>
                ) : (
                    <div className="space-y-4">
                        {lojas.map((l) => <CardLoja key={l.storeId} loja={l} aoMudar={carregar} />)}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
