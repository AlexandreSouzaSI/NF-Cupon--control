'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';

import { AppLayout } from '../../src/components/app-layout';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { moeda, nomeMes } from '@/lib/extrato';
import { SituacaoConciliacao, dataHora, erroMsg, type ResumoConciliacao } from '../../src/components/bills/conciliacao-comum';

// =============================================================================
// Financeiro → Conciliação do Extrato. Sobe o extrato do mês da loja, o
// sistema já separa o que dá (conta a pagar que já existe, vínculos,
// fornecedor, CEMIG/COPASA/DAS...); o resto se classifica aqui ou por link.
// "Aplicar" dá baixa nas contas que existiam e cria as que faltam (pagas).
// =============================================================================

const cartao = 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl';

export default function ConciliacaoExtratoPage() {
    const router = useRouter();
    const [lista, setLista] = useState<ResumoConciliacao[] | null>(null);
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const loja = getActiveStore();

    const carregar = useCallback(() => {
        api.get('/conciliacao-extrato', { params: { storeId: getActiveStore()?.id || undefined } })
            .then((r) => setLista(r.data ?? []))
            .catch(() => setLista([]));
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    async function importar() {
        if (!arquivos.length) return;
        setErro(null); setEnviando(true);
        try {
            const fd = new FormData();
            arquivos.forEach((f) => fd.append('files', f));
            const r = await api.post('/conciliacao-extrato/importar', fd, { params: { storeId: getActiveStore()?.id } });
            if (r.data.avisos?.length) alert(r.data.avisos.join('\n\n'));
            router.push(`/conciliacao-extrato/${r.data.id}`);
        } catch (e: any) {
            setErro(erroMsg(e, 'Não foi possível ler o extrato.'));
        } finally {
            setEnviando(false);
        }
    }

    return (
        <AppLayout title="Conciliação do Extrato">
            <div className="space-y-5">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Conciliação do Extrato</h1>
                    <p className="text-sm text-gray-500 dark:text-zinc-400">
                        Envie o extrato do mês da loja. O sistema acha o que já está em <Link href="/bills" className="text-blue-600 hover:underline">Contas a Pagar</Link> e sugere a categoria do resto;
                        você confere aqui ou manda por link. No fim, &quot;Aplicar em Contas a Pagar&quot; dá baixa nas contas que existiam e cria (já pagas) as que faltam, cada uma na sua categoria.
                    </p>
                </div>

                <div className={`${cartao} p-4 space-y-3`}>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Importar extrato do mês {loja ? <>— <span className="text-blue-600">{loja.name}</span></> : null}</p>
                    <p className="text-xs text-gray-500">
                        Aceita o extrato em <b>OFX</b> (qualquer banco — no internet banking procure &quot;exportar OFX / Money&quot;). Do Sicredi também dá pra mandar
                        o <b>Extrato</b> (.xls) junto com o relatório de <b>Movimentações PIX</b> (.xlsx), que traz a descrição de cada Pix.
                        O extrato fica na loja selecionada no topo.
                    </p>
                    <label data-tour="reconcile-import-file" className="flex items-center gap-2 px-3 py-4 rounded-lg border border-dashed border-gray-300 dark:border-zinc-700 text-sm text-gray-600 dark:text-zinc-300 cursor-pointer hover:border-blue-400">
                        <Upload size={16} />
                        {arquivos.length ? arquivos.map((f) => f.name).join(' + ') : 'Escolher arquivo(s) .ofx / .xls / .xlsx'}
                        <input type="file" multiple accept=".ofx,.xls,.xlsx" className="hidden" onChange={(e) => setArquivos(Array.from(e.target.files ?? []).slice(0, 2))} />
                    </label>
                    {erro && <p className="text-sm text-red-600">{erro}</p>}
                    <button data-tour="reconcile-import-button" onClick={importar} disabled={!arquivos.length || enviando || !loja} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">
                        {enviando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Importar e classificar
                    </button>
                    {!loja && <p className="text-xs text-amber-600">Selecione a loja no topo do sistema.</p>}
                </div>

                <div className={`${cartao} overflow-x-auto`}>
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 dark:border-zinc-800">
                            <tr><th className="px-4 py-2">Mês</th><th className="px-4 py-2">Loja / arquivos</th><th className="px-4 py-2 text-right">Saídas</th><th className="px-4 py-2 text-right">Pendente</th><th className="px-4 py-2">Situação</th><th /></tr>
                        </thead>
                        <tbody>
                            {lista === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500"><Loader2 className="inline animate-spin" size={16} /></td></tr>}
                            {lista?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Nenhum extrato importado ainda.</td></tr>}
                            {lista?.map((c) => (
                                <tr key={c.id} onClick={() => router.push(`/conciliacao-extrato/${c.id}`)} className="border-b last:border-0 border-gray-100 dark:border-zinc-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{nomeMes(c.mes)}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500"><span className="font-semibold text-gray-700 dark:text-zinc-300">{c.lojaNome}</span> · {c.arquivos.join(' + ')}<div>importado {dataHora(c.createdAt)}</div></td>
                                    <td className="px-4 py-3 text-right tabular-nums">{moeda(c.totalPagamentos)}<div className="text-xs text-gray-500">{c.nPagamentos} pagamentos</div></td>
                                    <td className="px-4 py-3 text-right tabular-nums">{c.pendentes ? <span className="text-amber-600">{moeda(c.valorPendente)}<div className="text-xs">{c.pendentes} itens</div></span> : <span className="text-emerald-600">—</span>}</td>
                                    <td className="px-4 py-3"><SituacaoConciliacao c={c} /></td>
                                    <td className="px-4 py-3 text-right text-blue-600 text-xs">Abrir →</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppLayout>
    );
}
