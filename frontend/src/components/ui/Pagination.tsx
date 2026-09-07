'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

type PaginationProps = {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
    if (totalPages <= 1) return null;

    return (
        <div className="mt-4 flex items-center justify-center gap-3">
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
                <ChevronLeft size={16} />
            </button>

            <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Página {page} de {totalPages}
            </span>

            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
                <ChevronRight size={16} />
            </button>
        </div>
    );
}
