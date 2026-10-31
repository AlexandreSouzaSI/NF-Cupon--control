'use client';

import Link from 'next/link';
import { CheckCircle2, FilePlus2, Wallet } from 'lucide-react';

// Barra grande no topo (igual ao Rota): CONTA A PAGAR | LANÇAR CONTAS | REGISTRAR PAGAMENTOS
export function AbasContas({ ativa }: { ativa: 'pagar' | 'lancar' | 'paga' }) {
    const base = 'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold tracking-wide transition';
    const on = 'bg-blue-600 text-white shadow';
    const off = 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800';
    return (
        <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/bills" className={`${base} ${ativa === 'pagar' ? on : off}`}>
                <Wallet size={18} /> CONTA A PAGAR
            </Link>
            <Link href="/bills/lancar" className={`${base} ${ativa === 'lancar' ? on : off}`}>
                <FilePlus2 size={18} /> LANÇAR CONTAS
            </Link>
            <Link href="/bills/pagamentos" className={`${base} ${ativa === 'paga' ? on : off}`}>
                <CheckCircle2 size={18} /> REGISTRAR PAGAMENTOS
            </Link>
        </div>
    );
}
