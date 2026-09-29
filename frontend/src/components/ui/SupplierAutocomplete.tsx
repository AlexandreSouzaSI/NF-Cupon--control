'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type SupplierSuggestion = {
    id: string;
    name: string;
};

// Cria (ou reaproveita, se já existir com esse nome) um fornecedor no
// backend. Usado no submit de qualquer formulário que deixa digitar um
// fornecedor novo — centraliza a chamada que antes estava duplicada à mão
// em app/purchases/new e em AcceptNfBillForm.
export async function findOrCreateSupplier(
    name: string,
): Promise<SupplierSuggestion> {
    const response = await api.post('/suppliers/find-or-create', {
        name: name.trim(),
    });

    return response.data;
}

type SupplierAutocompleteProps = {
    // Texto digitado/exibido no campo (nome do fornecedor, escolhido ou
    // ainda não cadastrado).
    supplierName: string;
    // supplierId só é preenchido quando o texto bate com um fornecedor já
    // existente escolhido na lista. Fica vazio enquanto o usuário digita
    // um nome que ainda não corresponde a nenhum selecionado — quem usa o
    // componente decide, no momento certo (normalmente no submit), se
    // chama findOrCreateSupplier() pra resolver/criar de verdade.
    supplierId: string;
    onChange: (supplierId: string, supplierName: string) => void;
    label?: string;
    placeholder?: string;
    inputClassName?: string;
    wrapperClassName?: string;
    disabled?: boolean;
    dataTour?: string;
};

// Campo "Fornecedor" digitável, padrão único em todo o app: busca
// enquanto digita (debounce), permite escolher um já cadastrado pela
// lista, e avisa que um nome sem correspondência será cadastrado
// automaticamente ao salvar. A criação em si fica por conta de quem usa
// este componente (ver findOrCreateSupplier acima) — cada tela decide o
// momento certo de criar (normalmente só no submit, não a cada tecla).
export function SupplierAutocomplete({
    supplierName,
    supplierId,
    onChange,
    label = 'Fornecedor',
    placeholder = 'Digite o nome do fornecedor',
    inputClassName,
    wrapperClassName,
    disabled,
    dataTour,
}: SupplierAutocompleteProps) {
    const [suggestions, setSuggestions] = useState<SupplierSuggestion[]>([]);
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!supplierName.trim()) {
            setSuggestions([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                setSearching(true);

                const response = await api.get('/suppliers', {
                    params: { search: supplierName.trim() },
                });

                setSuggestions(response.data || []);
            } catch {
                // silencioso: não trava a digitação por causa da busca
            } finally {
                setSearching(false);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [supplierName]);

    function handleTextChange(text: string) {
        // Editou o texto depois de já ter escolhido um fornecedor: precisa
        // resolver de novo (pode ser outro fornecedor existente ou um novo).
        onChange('', text);
        setOpen(true);
    }

    function handleSelect(supplier: SupplierSuggestion) {
        onChange(supplier.id, supplier.name);
        setSuggestions([]);
        setOpen(false);
    }

    return (
        <div className={wrapperClassName || 'relative'}>
            {label && (
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    {label}
                </label>
            )}

            <input
                data-tour={dataTour}
                value={supplierName}
                disabled={disabled}
                onChange={(event) => handleTextChange(event.target.value)}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder}
                className={
                    inputClassName ||
                    'h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-blue-500 disabled:opacity-50'
                }
                autoComplete="off"
            />

            {open && supplierName.trim() && !disabled && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                    {searching ? (
                        <p className="px-3 py-2 text-sm text-zinc-500">
                            Buscando...
                        </p>
                    ) : suggestions.length > 0 ? (
                        suggestions.map((supplier) => (
                            <button
                                type="button"
                                key={supplier.id}
                                onMouseDown={() => handleSelect(supplier)}
                                className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                {supplier.name}
                            </button>
                        ))
                    ) : (
                        <p className="px-3 py-2 text-xs text-zinc-500">
                            Nenhum fornecedor encontrado. Ao salvar,{' '}
                            <strong>{supplierName.trim()}</strong> será
                            cadastrado automaticamente.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
