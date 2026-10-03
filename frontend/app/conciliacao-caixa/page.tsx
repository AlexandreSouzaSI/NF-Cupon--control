'use client';

import { AppLayout } from '../../src/components/app-layout';
import { CashConciliationTab } from '../../src/components/meep/CashConciliationTab';
import { getActiveStore } from '@/lib/active-store';

export default function CashReconciliationPage() {
    const activeStore = getActiveStore();

    if (!activeStore) {
        return (
            <AppLayout title="Conciliação de Caixa">
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Selecione uma loja ativa no topo do sistema.
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="Conciliação de Caixa">
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold">Conciliação de Caixa</h2>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {activeStore.name} — Credito/Debito/PIX/Dinheiro vêm
                        da Meep por dia; a linha Editável já vem preenchida
                        com esse valor, mas pode ser corrigida se você
                        encontrar um valor diferente — é ela que fica salva.
                        Preencha a linha Banco com o que de fato caiu na
                        conta pra ver a Diferença.
                    </p>
                </div>

                <CashConciliationTab />
            </div>
        </AppLayout>
    );
}
