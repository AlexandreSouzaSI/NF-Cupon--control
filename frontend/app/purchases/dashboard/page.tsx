'use client';

import { useRouter } from 'next/navigation';

import { AppLayout } from '../../../src/components/app-layout';
import { PurchasesDashboardTab } from '../../../src/components/purchases/PurchasesDashboardTab';

export default function PurchasesDashboardPage() {
    const router = useRouter();

    return (
        <AppLayout title="Dashboard de Compras">
            <div className="space-y-5">
                <div>
                    <h2 className="text-2xl font-bold">Dashboard de Compras</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        Pipeline atual da loja ativa e total comprado no mês
                        selecionado.
                    </p>
                </div>

                <PurchasesDashboardTab
                    onSelectStage={(stage) =>
                        router.push(`/purchases?tab=${stage}`)
                    }
                />
            </div>
        </AppLayout>
    );
}
