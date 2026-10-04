'use client';

import { useMemo, useState } from 'react';
import { AppLayout } from '../../src/components/app-layout';
import { getUser, type UserRole } from '@/lib/auth';
import { getActiveStore } from '@/lib/active-store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { ShoppingBag, Receipt, History, RefreshCw, Loader2, DatabaseZap } from 'lucide-react';

import { ItemsPerDayTab } from '../../src/components/meep/ItemsPerDayTab';
import { TaxSalesTab } from '../../src/components/meep/TaxSalesTab';
import { SyncLogsTab } from '../../src/components/meep/SyncLogsTab';

// Conciliação de Caixa saiu daqui — agora mora só em /conciliacao-caixa
// (consolidada com o lançamento manual Sistema x Banco), pra não ficar
// duas telas falando de conciliação de caixa em lugares diferentes.
type TabKey = 'itens' | 'impostos' | 'sincronizacao';

const tabs: { key: TabKey; label: string; icon: typeof ShoppingBag; roles: UserRole[] }[] = [
    {
        key: 'itens',
        label: 'Itens por Dia',
        icon: ShoppingBag,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
    {
        key: 'impostos',
        label: 'Vendas e Impostos',
        icon: Receipt,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
    {
        key: 'sincronizacao',
        label: 'Histórico de Sincronização',
        icon: History,
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO', 'GERENTE'],
    },
];

export default function MeepPage() {
    const user = getUser();
    const activeStore = getActiveStore();

    const visibleTabs = useMemo(
        () => tabs.filter((tab) => !user || tab.roles.includes(user.role)),
        [user],
    );

    const [activeTab, setActiveTab] = useState<TabKey>(
        visibleTabs[0]?.key || 'itens',
    );

    const [syncing, setSyncing] = useState(false);
    const [rebuilding, setRebuilding] = useState(false);

    // Dia filtrado em "Itens por Dia" — também é o dia que o botão
    // "Reconstruir Venda/Lista deste dia" reconstrói/confere.
    const [diaItens, setDiaItens] = useState('');

    // Bump pra forçar as abas (ItemsPerDayTab/TaxSalesTab/SyncLogsTab) a
    // remontar e recarregar os dados depois de um sync manual — sem isso,
    // quem já está numa aba só veria o resultado novo trocando de aba e
    // voltando.
    const [refreshKey, setRefreshKey] = useState(0);

    async function handleSyncNow() {
        if (!activeStore) {
            toast.error('Não foi possível identificar a loja ativa.');
            return;
        }

        try {
            setSyncing(true);

            const response = await api.post(
                `/meep/${activeStore.id}/sync-now`,
            );

            const result = response.data as {
                success: boolean;
                message?: string;
                rebuildErros?: string[];
            };

            if (result.success) {
                toast.success(
                    'Sincronização disparada — itens, impostos e conciliação já estão sendo buscados de novo na Meep.',
                );
                // Falha ao atualizar o Venda/Lista não pode ficar muda.
                if (result.rebuildErros && result.rebuildErros.length > 0) {
                    toast.error(
                        `Venda/Lista não atualizou em ${result.rebuildErros.length} dia(s): ${result.rebuildErros
                            .slice(0, 3)
                            .join(' | ')}`,
                        { duration: 15000 },
                    );
                }
                setRefreshKey((key) => key + 1);
            } else {
                toast.error(
                    result.message ||
                    'Não foi possível sincronizar com a Meep.',
                );
            }
        } catch (error: any) {
            toast.error(
                error?.response?.data?.message ||
                'Erro ao sincronizar com a Meep.',
            );
        } finally {
            setSyncing(false);
        }
    }

    // Reconstrói o Venda/Lista do dia filtrado a partir dos pedidos que já
    // estão no banco (sem chamar a Meep) e, em seguida, confere Meep x
    // Venda/Lista daquele dia (a conferência é só pra Proprietário/Admin
    // Master — pra os outros o endpoint nega e a conferência é omitida).
    async function handleRebuildDay() {
        if (!activeStore) {
            toast.error('Não foi possível identificar a loja ativa.');
            return;
        }

        if (!diaItens) {
            toast.error('Escolha um dia em "Itens por Dia" pra reconstruir o Venda/Lista dele.');
            return;
        }

        try {
            setRebuilding(true);

            const response = await api.post(
                `/meep/${activeStore.id}/rebuild-product-sales`,
                null,
                { params: { dateFrom: diaItens, dateTo: diaItens } },
            );

            const result = response.data as {
                success: boolean;
                message?: string;
                totalItensEncontrados?: number;
                diasAlterados?: number;
                erros?: string[];
            };

            if (result.success === false) {
                toast.error(result.message || 'Não foi possível reconstruir agora.');
                return;
            }

            if (result.erros && result.erros.length > 0) {
                toast.error(
                    `Falhou ao reconstruir: ${result.erros.slice(0, 3).join(' | ')}`,
                    { duration: 15000 },
                );
            } else {
                toast.success(
                    `Venda/Lista de ${diaItens.split('-').reverse().join('/')} reconstruído (${result.totalItensEncontrados ?? 0} item(ns) da Meep).`,
                );
            }

            try {
                const check = await api.get('/meep/product-sales-check', {
                    params: { storeId: activeStore.id, date: diaItens },
                });
                const c = check.data as {
                    meep: { semTaxaECouvert: { produtosDistintos: number; valor: number } };
                    vendaLista: { produtosDistintos: number; valor: number };
                    diferenca: { produtosDistintos: number; valor: number };
                    defasado: boolean;
                };
                const money = (v: number) =>
                    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const mensagem = `Meep: ${c.meep.semTaxaECouvert.produtosDistintos} produtos / ${money(c.meep.semTaxaECouvert.valor)} · Venda/Lista: ${c.vendaLista.produtosDistintos} produtos / ${money(c.vendaLista.valor)} (sem taxa de serviço/couvert).`;
                if (c.defasado) {
                    toast.error(`Ainda difere: ${mensagem}`, { duration: 15000 });
                } else {
                    toast.success(`Conferido, bate: ${mensagem}`, { duration: 10000 });
                }
            } catch {
                // Sem permissão pra conferência (ou falha dela) — o
                // rebuild em si já foi reportado acima.
            }
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao reconstruir o Venda/Lista.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setRebuilding(false);
        }
    }

    return (
        <AppLayout title="Vendas Meep">
            <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-bold">Vendas Meep</h2>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Itens vendidos por dia e CFOP/NCM por venda —
                            sincronizado automaticamente da Meep (ver Cadastros →
                            Lojas pra configurar a credencial). A Conciliação de
                            Caixa agora fica em Financeiro → Conciliação de
                            Caixa.
                        </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                        onClick={handleRebuildDay}
                        disabled={rebuilding || !diaItens}
                        title={
                            diaItens
                                ? 'Recalcula o Venda/Lista só desse dia, a partir dos pedidos já salvos (não chama a Meep), e confere se bate com Itens por Dia'
                                : 'Escolha um dia em "Itens por Dia" pra habilitar'
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        {rebuilding ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <DatabaseZap size={14} />
                        )}
                        Reconstruir Venda/Lista deste dia
                    </button>

                    <button
                        onClick={handleSyncNow}
                        disabled={syncing}
                        title="Busca de novo na Meep os pedidos, impostos e conciliação (mesma rotina do cron automático, só que agora)"
                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:cursor-wait ${syncing
                            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-500'
                            : 'border-teal-500/30 bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 dark:text-teal-400'
                            }`}
                    >
                        {syncing ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <RefreshCw size={16} />
                        )}
                        Sincronizar agora
                    </button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2">
                    {visibleTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;

                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${isActive
                                    ? 'bg-teal-600 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                    }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'itens' && (
                    <ItemsPerDayTab
                        key={`itens-${refreshKey}`}
                        day={diaItens}
                        onDayChange={setDiaItens}
                    />
                )}
                {activeTab === 'impostos' && (
                    <TaxSalesTab key={`impostos-${refreshKey}`} />
                )}
                {activeTab === 'sincronizacao' && (
                    <SyncLogsTab key={`sync-${refreshKey}`} />
                )}
            </div>
        </AppLayout>
    );
}
