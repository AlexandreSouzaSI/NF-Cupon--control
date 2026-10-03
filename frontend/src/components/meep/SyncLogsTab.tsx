'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { CheckCircle2, XCircle } from 'lucide-react';

type SyncLog = {
    id: string;
    endpoint: string;
    rangeStart: string;
    rangeEnd: string;
    success: boolean;
    message: string;
    ordersFetched: number;
    transactionsFetched: number;
    createdAt: string;
};

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('pt-BR');
}

const ENDPOINT_LABEL: Record<string, string> = {
    SIMPLE_SALES: 'Vendas (pedidos + pagamentos)',
    SALES: 'CFOP/NCM',
    CONCILIATION: 'Conciliação de caixa',
};

// Histórico das últimas 20 tentativas de sincronização com a Meep —
// mesmo espírito do histórico de sync da Sefaz (ver Cadastros → Lojas).
// Pensado pra diagnosticar sem precisar olhar log de servidor: se o
// Venda/Lista está trazendo menos vendas do que o esperado, dá pra
// conferir aqui se a sincronização está rodando certo (hora em hora) ou
// se está falhando silenciosamente.
export function SyncLogsTab() {
    const store = getActiveStore();
    const [loading, setLoading] = useState(true);
    const [logs, setLogs] = useState<SyncLog[]>([]);

    async function load() {
        if (!store) return;

        try {
            setLoading(true);
            const response = await api.get('/meep/sync-logs', {
                params: { storeId: store.id },
            });
            setLogs(response.data || []);
        } catch {
            toast.error('Erro ao carregar o histórico de sincronização.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!store) {
        return (
            <p className="text-sm text-zinc-500">
                Selecione uma loja pra ver o histórico de sincronização.
            </p>
        );
    }

    if (loading) {
        return <p className="text-sm text-zinc-500">Carregando...</p>;
    }

    if (logs.length === 0) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Nenhuma sincronização registrada ainda pra essa loja.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {logs.map((log) => (
                <div
                    key={log.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${log.success
                        ? 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                        : 'border-red-500/30 bg-red-500/5'
                        }`}
                >
                    {log.success ? (
                        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                        <XCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                    )}

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-zinc-900 dark:text-white">
                                {ENDPOINT_LABEL[log.endpoint] || log.endpoint}
                            </span>
                            <span className="text-xs text-zinc-500">
                                {formatDateTime(log.createdAt)}
                            </span>
                        </div>
                        <p className="text-xs text-zinc-500">
                            Janela: {formatDateTime(log.rangeStart)} até{' '}
                            {formatDateTime(log.rangeEnd)}
                        </p>
                        <p
                            className={`mt-1 text-xs ${log.success
                                ? 'text-zinc-600 dark:text-zinc-400'
                                : 'text-red-600 dark:text-red-400'
                                }`}
                        >
                            {log.message}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}
