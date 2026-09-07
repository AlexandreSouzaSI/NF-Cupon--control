'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Loader2, X } from 'lucide-react';

type SuggestionItem = {
    id: string;
    name: string;
};

export type AcceptNfBillPayload = {
    supplierName: string;
    categoryName?: string;
    dueDate: string;
    pixKey?: string;
    barcode?: string;
};

type PixOrBoleto = 'NONE' | 'PIX' | 'BOLETO';

type AcceptNfBillFormProps = {
    initialSupplierName?: string;
    initialValue?: number | string | null;
    submitting?: boolean;
    onCancel: () => void;
    onSubmit: (payload: AcceptNfBillPayload) => void;
};

function formatCurrency(value: string | number | null | undefined) {
    return Number(value || 0).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

// Mini-formulário usado ao "Aceitar e gerar conta" tanto na NF de entrada
// quanto na de serviço — só os 4 campos que interessam pro dia a dia
// (Empresa, Categoria, Valor, Vencimento) + PIX ou boleto opcional.
export function AcceptNfBillForm({
    initialSupplierName,
    initialValue,
    submitting,
    onCancel,
    onSubmit,
}: AcceptNfBillFormProps) {
    const [supplierQuery, setSupplierQuery] = useState(
        initialSupplierName || '',
    );
    const [supplierSuggestions, setSupplierSuggestions] = useState<
        SuggestionItem[]
    >([]);
    const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

    const [categoryQuery, setCategoryQuery] = useState('');
    const [categorySuggestions, setCategorySuggestions] = useState<
        SuggestionItem[]
    >([]);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const [categorySuggested, setCategorySuggested] = useState(false);

    const [value, setValue] = useState(
        initialValue ? String(Number(initialValue)) : '',
    );
    const [dueDate, setDueDate] = useState('');

    const [pixOrBoleto, setPixOrBoleto] = useState<PixOrBoleto>('NONE');
    const [pixKey, setPixKey] = useState('');
    const [barcode, setBarcode] = useState('');

    // Busca fornecedores enquanto digita, mesmo padrão do formulário de
    // Nova Compra.
    useEffect(() => {
        if (!supplierQuery.trim()) {
            setSupplierSuggestions([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                const response = await api.get('/suppliers', {
                    params: { search: supplierQuery.trim() },
                });
                setSupplierSuggestions(response.data || []);
            } catch {
                // silencioso
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [supplierQuery]);

    // Categoria digitável, mesmo padrão do fornecedor.
    useEffect(() => {
        if (!categoryQuery.trim()) {
            setCategorySuggestions([]);
            return;
        }

        const timeoutId = setTimeout(async () => {
            try {
                const response = await api.get('/bill-categories', {
                    params: { search: categoryQuery.trim() },
                });
                setCategorySuggestions(response.data || []);
            } catch {
                // silencioso
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [categoryQuery]);

    // Quando escolhe um fornecedor já cadastrado, sugere a categoria usada
    // da última vez pra esse mesmo fornecedor (só sugestão — o usuário
    // ainda pode trocar).
    async function selectSupplier(supplier: SuggestionItem) {
        setSupplierQuery(supplier.name);
        setSupplierSuggestions([]);
        setSupplierDropdownOpen(false);

        if (categoryQuery.trim()) return;

        try {
            const response = await api.get('/bill-categories/suggest', {
                params: { supplierId: supplier.id },
            });

            if (response.data?.name) {
                setCategoryQuery(response.data.name);
                setCategorySuggested(true);
            }
        } catch {
            // silencioso — sugestão é só conveniência
        }
    }

    function handleSupplierQueryChange(text: string) {
        setSupplierQuery(text);
        setSupplierDropdownOpen(true);
    }

    function selectCategory(category: SuggestionItem) {
        setCategoryQuery(category.name);
        setCategorySuggestions([]);
        setCategoryDropdownOpen(false);
        setCategorySuggested(false);
    }

    function handleCategoryQueryChange(text: string) {
        setCategoryQuery(text);
        setCategoryDropdownOpen(true);
        setCategorySuggested(false);
    }

    function handleSubmit() {
        onSubmit({
            supplierName: supplierQuery.trim(),
            categoryName: categoryQuery.trim() || undefined,
            dueDate,
            pixKey: pixOrBoleto === 'PIX' ? pixKey.trim() : undefined,
            barcode: pixOrBoleto === 'BOLETO' ? barcode.trim() : undefined,
        });
    }

    const canSubmit =
        supplierQuery.trim().length > 0 && dueDate.length > 0 && !submitting;

    return (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Empresa
                    </label>
                    <input
                        value={supplierQuery}
                        onChange={(e) =>
                            handleSupplierQueryChange(e.target.value)
                        }
                        onFocus={() => setSupplierDropdownOpen(true)}
                        onBlur={() =>
                            setTimeout(
                                () => setSupplierDropdownOpen(false),
                                150,
                            )
                        }
                        placeholder="Nome da empresa"
                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                    />

                    {supplierDropdownOpen && supplierQuery.trim() && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                            {supplierSuggestions.length > 0 ? (
                                supplierSuggestions.map((supplier) => (
                                    <button
                                        type="button"
                                        key={supplier.id}
                                        onMouseDown={() =>
                                            selectSupplier(supplier)
                                        }
                                        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                        {supplier.name}
                                    </button>
                                ))
                            ) : (
                                <p className="px-3 py-2 text-xs text-zinc-500">
                                    Nova empresa: <strong>{supplierQuery.trim()}</strong>{' '}
                                    será cadastrada automaticamente.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="relative">
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Categoria{' '}
                        {categorySuggested && (
                            <span className="text-emerald-500">
                                (sugerida pelo histórico)
                            </span>
                        )}
                    </label>
                    <input
                        value={categoryQuery}
                        onChange={(e) =>
                            handleCategoryQueryChange(e.target.value)
                        }
                        onFocus={() => setCategoryDropdownOpen(true)}
                        onBlur={() =>
                            setTimeout(
                                () => setCategoryDropdownOpen(false),
                                150,
                            )
                        }
                        placeholder="Ex: Revenda, Matéria-prima..."
                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                    />

                    {categoryDropdownOpen && categoryQuery.trim() && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-xl">
                            {categorySuggestions.length > 0 ? (
                                categorySuggestions.map((category) => (
                                    <button
                                        type="button"
                                        key={category.id}
                                        onMouseDown={() =>
                                            selectCategory(category)
                                        }
                                        className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                        {category.name}
                                    </button>
                                ))
                            ) : (
                                <p className="px-3 py-2 text-xs text-zinc-500">
                                    Nova categoria: <strong>{categoryQuery.trim()}</strong>{' '}
                                    será cadastrada automaticamente.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Valor
                    </label>
                    <div className="flex h-10 w-full items-center rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-3 text-sm text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(value)}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                        Valor da própria NF — não editável aqui.
                    </p>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                        Data de vencimento
                    </label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    PIX ou código de barras (opcional)
                </label>

                <div className="mb-2 flex gap-1 rounded-lg border border-zinc-300 dark:border-zinc-700 p-1 w-fit">
                    {(['NONE', 'PIX', 'BOLETO'] as PixOrBoleto[]).map(
                        (option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setPixOrBoleto(option)}
                                className={`rounded-md px-3 py-1 text-xs font-medium transition ${pixOrBoleto === option
                                    ? 'bg-emerald-500 text-white'
                                    : 'text-zinc-600 dark:text-zinc-400'
                                    }`}
                            >
                                {option === 'NONE'
                                    ? 'Nenhum'
                                    : option === 'PIX'
                                        ? 'PIX'
                                        : 'Boleto'}
                            </button>
                        ),
                    )}
                </div>

                {pixOrBoleto === 'PIX' && (
                    <input
                        value={pixKey}
                        onChange={(e) => setPixKey(e.target.value)}
                        placeholder="Chave PIX"
                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                )}

                {pixOrBoleto === 'BOLETO' && (
                    <input
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Código de barras / linha digitável"
                        className="h-10 w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 text-sm outline-none focus:border-emerald-500"
                    />
                )}
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={handleSubmit}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                    {submitting && (
                        <Loader2 size={16} className="animate-spin" />
                    )}
                    Confirmar e gerar conta
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
