'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Ban, CheckCircle2, FileUp, Landmark, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { AppLayout } from '../../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';

// =============================================================================
// Conciliação bancária da Conta a Pagar — importa o extrato (.ofx) e sugere,
// pra cada saída, as contas em aberto mais parecidas (valor + data + nome).
// É diferente da "Conciliação do Extrato" (menu), que classifica o extrato
// inteiro por categoria e cria contas: aqui só se dá baixa nas contas que já
// existem.
// =============================================================================

const campoClasse =
    'w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white placeholder:text-gray-400';

function formatCurrency(value: number | null | undefined) {
    return (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
    return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
}

type Bill = {
    id: string;
    description: string;
    value: string | number;
    dueDate: string;
    status: 'OPEN' | 'PAID' | 'OVERDUE' | 'CANCELED';
    notes?: string | null;
    documentNumber?: string | null;
    supplier?: { name: string; cnpj?: string | null } | null;
    category?: { name: string } | null;
};

type OfxTransaction = {
    fitId: string;
    type: string;
    postedAt: string;
    amount: number;
    description: string;
};

type RowStatus = 'CONFIRMED' | 'IGNORED';
type Filtro = 'TODAS' | 'COM' | 'SEM';
type Sugestao = { conta: Bill; score: number; motivos: string[] };

// ---------- pontuação de semelhança ----------

const PALAVRAS_IGNORADAS = new Set([
    'pagamento', 'pix', 'pixdeb', 'deb', 'debito', 'transferencia', 'pgto', 'cobranca', 'boleto',
    'compra', 'ltda', 'eireli', 'comercio', 'servicos', 'brasil', 'para', 'conta', 'tarifa',
    'enviado', 'recebido', 'liquidacao', 'titulo', 'sicredi',
]);

function normalizar(texto: string) {
    return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function palavras(texto: string) {
    return normalizar(texto)
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !PALAVRAS_IGNORADAS.has(p));
}

function numerosLongos(texto: string) {
    return (texto.match(/\d{8,}/g) ?? []).map((n) => n.replace(/^0+/, ''));
}

function diasEntre(a: string, b: string) {
    const da = new Date(`${a.slice(0, 10)}T12:00:00`).getTime();
    const db = new Date(`${b.slice(0, 10)}T12:00:00`).getTime();
    return Math.round((da - db) / 86400000);
}

const valorConta = (c: Bill) => Number(c.value || 0);

function pontuar(conta: Bill, t: OfxTransaction): Sugestao {
    const motivos: string[] = [];
    let score = 0;
    const valorTransacao = Math.abs(t.amount);
    const valor = valorConta(conta);

    // valor
    const dif = Math.abs(valor - valorTransacao);
    const pct = valorTransacao > 0 ? dif / valorTransacao : 1;
    if (dif < 0.01) { score += 60; motivos.push('valor igual'); }
    else if (pct <= 0.02) { score += 45; motivos.push('valor quase igual'); }
    else if (pct <= 0.1) { score += 25; motivos.push('valor parecido'); }
    else if (pct <= 0.25) { score += 8; }

    // data
    const dias = Math.abs(diasEntre(conta.dueDate, t.postedAt));
    if (dias <= 3) { score += 25; motivos.push(dias === 0 ? 'mesmo dia' : `${dias} dia(s) de diferença`); }
    else if (dias <= 10) { score += 18; motivos.push(`${dias} dias de diferença`); }
    else if (dias <= 20) { score += 10; motivos.push(`${dias} dias de diferença`); }
    else if (dias <= 35) { score += 4; }

    // texto
    const alvo = `${conta.description} ${conta.supplier?.name ?? ''} ${conta.supplier?.cnpj ?? ''} ${conta.category?.name ?? ''} ${conta.notes ?? ''} ${conta.documentNumber ?? ''}`;
    const nums = numerosLongos(t.description);
    const numerosAlvo = alvo.replace(/[.\-/]/g, '');
    if (nums.some((n) => n.length >= 8 && numerosAlvo.includes(n))) {
        score += 30;
        motivos.push('CNPJ/CPF confere');
    }
    const palavrasT = new Set(palavras(t.description));
    const palavrasC = new Set(palavras(alvo));
    let comuns = 0;
    palavrasT.forEach((p) => { if (palavrasC.has(p)) comuns++; });
    if (comuns > 0) {
        score += Math.min(25, 12 + comuns * 6);
        motivos.push('nome parecido');
    }

    return { conta, score, motivos };
}

export default function BillsReconcilePage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [contasAbertas, setContasAbertas] = useState<Bill[]>([]);
    const [carregandoContas, setCarregandoContas] = useState(true);
    const [enviando, setEnviando] = useState(false);

    const [transacoes, setTransacoes] = useState<OfxTransaction[]>([]);
    // escolha manual do usuário (sobrepõe a sugestão automática)
    const [escolha, setEscolha] = useState<Record<string, string>>({});
    const [statusLinha, setStatusLinha] = useState<Record<string, RowStatus>>({});
    const [contaDaLinha, setContaDaLinha] = useState<Record<string, string>>({});
    const [fitIdProcessando, setFitIdProcessando] = useState<string | null>(null);
    const [lote, setLote] = useState(false);
    const [filtro, setFiltro] = useState<Filtro>('TODAS');

    async function carregarContasAbertas() {
        setCarregandoContas(true);
        try {
            const res = await api.get('/bills', {
                params: { storeId: getActiveStore()?.id || undefined },
            });
            const todas: Bill[] = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
            setContasAbertas(todas.filter((b) => b.status === 'OPEN' || b.status === 'OVERDUE'));
        } catch {
            toast.error('Erro ao carregar contas em aberto.');
        } finally {
            setCarregandoContas(false);
        }
    }

    useEffect(() => {
        carregarContasAbertas();
    }, []);

    // Sugestões por transação. A melhor só vira pré-seleção se for clara
    // (boa pontuação, sem empate) e se a mesma conta não tiver sido escolhida
    // por outra saída acima.
    const { sugestoes, preSelecionadas } = useMemo(() => {
        const sug: Record<string, Sugestao[]> = {};
        const pre: Record<string, string> = {};
        const usadas = new Set<string>(Object.values(escolha).filter(Boolean));
        for (const t of transacoes) {
            if (statusLinha[t.fitId]) continue;
            const lista = contasAbertas
                .map((c) => pontuar(c, t))
                .filter((s) => s.score >= 35)
                .sort((a, b) => b.score - a.score)
                .slice(0, 4);
            sug[t.fitId] = lista;
            if (escolha[t.fitId] !== undefined) continue;
            const melhor = lista.find((s) => !usadas.has(s.conta.id));
            if (melhor && melhor.score >= 65) {
                const segundo = lista.find((s) => s !== melhor && !usadas.has(s.conta.id));
                if (!segundo || melhor.score - segundo.score >= 10) {
                    pre[t.fitId] = melhor.conta.id;
                    usadas.add(melhor.conta.id);
                }
            }
        }
        return { sugestoes: sug, preSelecionadas: pre };
    }, [transacoes, contasAbertas, statusLinha, escolha]);

    const selecionada = (fitId: string) => escolha[fitId] ?? preSelecionadas[fitId] ?? '';

    async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            setEnviando(true);
            const response = await api.post('/bills/reconcile/import', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const todas: OfxTransaction[] = response.data?.transactions ?? [];
            // Conta a pagar é dinheiro saindo — só os débitos do extrato.
            const debitos = todas.filter((t) => t.amount < 0).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
            setTransacoes(debitos);
            setEscolha({});
            setStatusLinha({});
            setContaDaLinha({});
            setFiltro('TODAS');
            const entradas = todas.length - debitos.length;
            toast.success(`${debitos.length} saída(s) no extrato${entradas > 0 ? ` (${entradas} entrada(s) ignorada(s))` : ''}.`);
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Erro ao ler o arquivo OFX.');
        } finally {
            setEnviando(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    async function baixar(transacao: OfxTransaction, contaId: string) {
        const valorPago = Math.abs(transacao.amount);
        const conta = contasAbertas.find((c) => c.id === contaId);
        const diferenca = conta ? valorPago - valorConta(conta) : 0;
        const obsDiferenca = Math.abs(diferenca) >= 0.01
            ? ` Diferença de ${formatCurrency(Math.abs(diferenca))} ${diferenca > 0 ? 'a mais (juros/multa)' : 'a menos (desconto)'} em relação à conta.`
            : '';
        await api.patch(`/bills/${contaId}/pay`, {
            paidAt: transacao.postedAt,
            reconciliationNote: `Conciliado via extrato OFX: "${transacao.description.replace(/\s+/g, ' ').trim()}" (${formatCurrency(valorPago)} em ${formatDate(transacao.postedAt)}).${obsDiferenca}`,
        });
        setContasAbertas((atual) => atual.filter((c) => c.id !== contaId));
        setContaDaLinha((atual) => ({ ...atual, [transacao.fitId]: conta?.description ?? '' }));
        setStatusLinha((atual) => ({ ...atual, [transacao.fitId]: 'CONFIRMED' }));
    }

    async function confirmarVinculo(transacao: OfxTransaction) {
        const contaId = selecionada(transacao.fitId);
        if (!contaId) {
            toast.error('Selecione a conta correspondente antes de confirmar.');
            return;
        }
        try {
            setFitIdProcessando(transacao.fitId);
            await baixar(transacao, contaId);
            toast.success('Conta marcada como paga.');
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Erro ao confirmar pagamento.');
        } finally {
            setFitIdProcessando(null);
        }
    }

    function ignorarTransacao(fitId: string) {
        setStatusLinha((atual) => ({ ...atual, [fitId]: 'IGNORED' }));
    }

    const pendentesLista = transacoes.filter((t) => !statusLinha[t.fitId]);
    const comSugestaoAuto = pendentesLista.filter((t) => selecionada(t.fitId));

    async function confirmarSugeridas() {
        if (!comSugestaoAuto.length) return;
        if (!confirm(`Confirmar ${comSugestaoAuto.length} baixa(s) com a conta sugerida? Confira antes se estão certas.`)) return;
        setLote(true);
        const usadas = new Set<string>();
        let ok = 0;
        let falhas = 0;
        for (const t of comSugestaoAuto) {
            const contaId = selecionada(t.fitId);
            if (!contaId || usadas.has(contaId)) continue;
            usadas.add(contaId);
            try {
                await baixar(t, contaId);
                ok++;
            } catch {
                falhas++; // a linha continua pendente
            }
        }
        setLote(false);
        if (ok) toast.success(`${ok} conta(s) baixada(s).`);
        if (falhas) toast.error(`${falhas} não puderam ser baixadas — continuam pendentes.`);
    }

    const visiveis = transacoes.filter((t) => {
        if (filtro === 'TODAS') return true;
        const tem = (sugestoes[t.fitId] ?? []).length > 0;
        return filtro === 'COM' ? tem : !tem;
    });

    return (
        <AppLayout title="Conciliação bancária">
            <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <button
                            onClick={() => router.push('/bills')}
                            className="mb-2 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition"
                        >
                            <ArrowLeft size={16} />
                            Voltar para Contas a Pagar
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conciliação bancária</h1>
                        <p className="text-sm text-gray-500 dark:text-zinc-400">
                            Importe o extrato (.ofx) e confirme quais contas em aberto já foram pagas. Sugerimos as contas com
                            valor, data e nome parecidos.
                        </p>
                    </div>

                    <div data-tour="reconcile-import-button">
                        <input ref={fileInputRef} data-tour="reconcile-import-file" type="file" accept=".ofx" className="hidden" onChange={handleFileChange} />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={enviando || carregandoContas}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
                        >
                            {enviando ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                            {transacoes.length > 0 ? 'Importar outro extrato' : 'Importar extrato OFX'}
                        </button>
                    </div>
                </div>

                {transacoes.length === 0 ? (
                    <div className="p-10 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-center">
                        <Landmark className="mx-auto mb-3 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nenhum extrato importado ainda</h3>
                        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-zinc-400">
                            Exporte o extrato do internet banking em formato OFX e importe aqui.
                        </p>
                        {carregandoContas ? (
                            <p className="mt-4 text-sm text-gray-400">Carregando contas em aberto…</p>
                        ) : contasAbertas.length === 0 ? (
                            <p className="mt-4 text-sm text-yellow-600 dark:text-yellow-400">
                                Não há contas em aberto pra conciliar no momento.
                            </p>
                        ) : (
                            <p className="mt-4 text-xs text-gray-400">{contasAbertas.length} conta(s) em aberto nesta loja.</p>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-3 p-4 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span className="text-gray-500 dark:text-zinc-400">
                                {pendentesLista.length} de {transacoes.length} saída(s) pendente(s) •{' '}
                                {comSugestaoAuto.length} com sugestão forte
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                {(['TODAS', 'COM', 'SEM'] as Filtro[]).map((f) => (
                                    <button
                                        key={f}
                                        onClick={() => setFiltro(f)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${filtro === f
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                                            }`}
                                    >
                                        {f === 'TODAS' ? 'Todas' : f === 'COM' ? 'Com sugestão' : 'Sem sugestão'}
                                    </button>
                                ))}
                                <button
                                    onClick={confirmarSugeridas}
                                    disabled={lote || comSugestaoAuto.length === 0}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition"
                                >
                                    {lote ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                    Confirmar sugeridas ({comSugestaoAuto.length})
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {visiveis.map((transacao) => {
                                const status = statusLinha[transacao.fitId];
                                const processando = fitIdProcessando === transacao.fitId;
                                const lista = sugestoes[transacao.fitId] ?? [];
                                const atual = selecionada(transacao.fitId);
                                const descricao = transacao.description.replace(/\s+/g, ' ').trim();

                                return (
                                    <div
                                        key={transacao.fitId}
                                        className={`p-4 rounded-2xl border ${status === 'CONFIRMED'
                                            ? 'border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/5'
                                            : status === 'IGNORED'
                                                ? 'border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/40 opacity-60'
                                                : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs text-gray-500 dark:text-zinc-400">{formatDate(transacao.postedAt)}</p>
                                                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-white break-words">{descricao}</p>
                                            </div>
                                            <span className="shrink-0 text-base font-bold text-red-500 dark:text-red-400">
                                                {formatCurrency(Math.abs(transacao.amount))}
                                            </span>
                                        </div>

                                        {status === 'CONFIRMED' ? (
                                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-500/10 text-sm font-medium text-green-700 dark:text-green-400">
                                                    <CheckCircle2 size={15} />
                                                    Conciliada
                                                </span>
                                                {contaDaLinha[transacao.fitId] && (
                                                    <span className="text-xs text-gray-500 dark:text-zinc-400">{contaDaLinha[transacao.fitId]}</span>
                                                )}
                                            </div>
                                        ) : status === 'IGNORED' ? (
                                            <div className="mt-3 flex items-center gap-3">
                                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-zinc-800 text-sm text-gray-500 dark:text-zinc-400">
                                                    <Ban size={15} />
                                                    Ignorada
                                                </span>
                                                <button
                                                    onClick={() => setStatusLinha((s) => { const n = { ...s }; delete n[transacao.fitId]; return n; })}
                                                    className="text-xs text-blue-600 hover:underline"
                                                >
                                                    Desfazer
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="mt-3 space-y-3">
                                                {lista.length > 0 ? (
                                                    <div className="grid gap-2 md:grid-cols-2">
                                                        {lista.map((s) => {
                                                            const ativa = atual === s.conta.id;
                                                            return (
                                                                <button
                                                                    key={s.conta.id}
                                                                    onClick={() => setEscolha((e) => ({ ...e, [transacao.fitId]: s.conta.id }))}
                                                                    className={`text-left p-3 rounded-xl border transition ${ativa
                                                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                                                                        : 'border-gray-200 dark:border-zinc-700 hover:border-blue-300 dark:hover:border-blue-500/50'
                                                                        }`}
                                                                >
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <span className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                                                                            {s.conta.description}
                                                                        </span>
                                                                        <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-zinc-300">
                                                                            {formatCurrency(valorConta(s.conta))}
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
                                                                        vence {formatDate(s.conta.dueDate)}
                                                                        {s.conta.supplier?.name ? ` • ${s.conta.supplier.name}` : ''}
                                                                        {s.conta.category ? ` • ${s.conta.category.name}` : ''}
                                                                    </p>
                                                                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                                                                        {s.motivos.join(' • ') || 'semelhança'} ({Math.min(99, s.score)}%)
                                                                    </p>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-gray-500 dark:text-zinc-400">
                                                        Nenhuma conta parecida encontrada — escolha manualmente ou ignore.
                                                    </p>
                                                )}

                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                    <select
                                                        value={atual}
                                                        onChange={(e) => setEscolha((x) => ({ ...x, [transacao.fitId]: e.target.value }))}
                                                        className={`${campoClasse} sm:flex-1`}
                                                    >
                                                        <option value="">Outra conta…</option>
                                                        {contasAbertas.map((conta) => (
                                                            <option key={conta.id} value={conta.id}>
                                                                {formatDate(conta.dueDate)} • {formatCurrency(valorConta(conta))} •{' '}
                                                                {conta.description.slice(0, 70)}
                                                            </option>
                                                        ))}
                                                    </select>

                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => confirmarVinculo(transacao)}
                                                            disabled={processando || lote || !atual}
                                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                                                        >
                                                            {processando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                            Confirmar
                                                        </button>
                                                        <button
                                                            onClick={() => ignorarTransacao(transacao.fitId)}
                                                            title="Não corresponde a nenhuma conta"
                                                            className="p-2 rounded-lg border border-gray-300 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
                                                        >
                                                            <Ban size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </AppLayout>
    );
}
