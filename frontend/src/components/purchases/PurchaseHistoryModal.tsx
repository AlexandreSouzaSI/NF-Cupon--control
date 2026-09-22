'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
    CheckCircle2,
    Clock,
    FileText,
    History,
    Loader2,
    PackageCheck,
    Plus,
    Receipt,
    Wallet,
    X,
    XCircle,
} from 'lucide-react';

type HistoryEntry = {
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
    } | null;
};

type PurchaseHistoryModalProps = {
    purchaseId: string;
    purchaseDescription: string;
    onClose: () => void;
};

// Log de auditoria (quem fez o quê e quando) — reflete 1 pra 1 o enum
// PurchaseHistoryAction do backend (purchases.service.ts / bills.service.ts).
const ACTION_LABEL: Record<string, string> = {
    CREATED: 'Compra criada',
    UPDATED: 'Compra alterada',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    COUPON_UPLOADED: 'Cupom fiscal anexado',
    INVOICE_UPLOADED: 'Nota fiscal anexada',
    RECEIVED: 'Recebimento registrado',
    CLOSED: 'Compra fechada',
    BILL_CREATED: 'Conta a pagar criada',
    BILL_PAID: 'Conta a pagar paga',
    DELETION_REQUESTED: 'Exclusão solicitada',
    PAYMENT_STATUS_CHANGED: 'Status de pagamento alterado',
};

const ACTION_ICON: Record<string, typeof History> = {
    CREATED: Plus,
    UPDATED: FileText,
    APPROVED: CheckCircle2,
    REJECTED: XCircle,
    COUPON_UPLOADED: Receipt,
    INVOICE_UPLOADED: FileText,
    RECEIVED: PackageCheck,
    CLOSED: CheckCircle2,
    BILL_CREATED: Wallet,
    BILL_PAID: Wallet,
    DELETION_REQUESTED: XCircle,
    PAYMENT_STATUS_CHANGED: Clock,
};

function formatDateTime(value: string) {
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function PurchaseHistoryModal({
    purchaseId,
    purchaseDescription,
    onClose,
}: PurchaseHistoryModalProps) {
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const response = await api.get(
                    `/purchases/${purchaseId}/history`,
                );

                setEntries(response.data);
            } catch {
                toast.error('Erro ao carregar o histórico.');
            } finally {
                setLoading(false);
            }
        }

        load();
    }, [purchaseId]);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }

        window.addEventListener('keydown', handleKeyDown);

        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl">
                <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
                    <div>
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <History size={18} />
                            Histórico
                        </h2>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {purchaseDescription}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="space-y-3 p-4">
                    {loading && (
                        <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500 dark:text-zinc-400">
                            <Loader2 size={16} className="animate-spin" />
                            Carregando...
                        </div>
                    )}

                    {!loading && entries.length === 0 && (
                        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            Nenhum registro ainda.
                        </p>
                    )}

                    {!loading &&
                        entries.map((entry) => {
                            const Icon = ACTION_ICON[entry.action] || History;

                            return (
                                <div
                                    key={entry.id}
                                    className="flex gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-3"
                                >
                                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                        <Icon size={14} />
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                            <p className="text-sm font-semibold">
                                                {ACTION_LABEL[entry.action] ||
                                                    entry.action}
                                            </p>
                                            <span className="text-xs text-zinc-400">
                                                {formatDateTime(entry.createdAt)}
                                            </span>
                                        </div>

                                        {entry.comment && (
                                            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                {entry.comment}
                                            </p>
                                        )}

                                        <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                                            {entry.user?.name || 'Sistema'}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}
