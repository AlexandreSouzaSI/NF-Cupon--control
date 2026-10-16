'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

// Valor que só "assenta" depois de `delay` ms sem mudar — evita uma
// requisição por tecla nas buscas feitas no servidor.
export function useDebouncedValue<T>(value: T, delay = 400): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}

// Caixa de busca única das listas de Notas Fiscais (Entrada, Saída e
// Serviço): número da NF, nome (fornecedor/prestador/cliente) ou valor.
export function NfSearchInput({
    value,
    onChange,
    placeholder = 'Buscar por número, nome ou valor...',
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="relative w-full sm:max-w-sm">
            <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />

            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label="Buscar NF por número, nome ou valor"
                className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 pl-9 pr-9 text-sm outline-none placeholder:text-zinc-400 focus:border-blue-500"
            />

            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
