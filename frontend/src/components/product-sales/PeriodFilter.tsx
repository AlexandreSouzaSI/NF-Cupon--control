'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { CalendarRange } from 'lucide-react';

import { formatarNomePadraoImportacao } from './periodo-format';

type ProductSalesImport = {
    id: string;
    nomeLocal: string | null;
    periodoInicio: string | null;
    periodoFim: string | null;
    arquivoOriginal: string;
    _count: { entries: number };
};

// Filtro compartilhado entre Dashboard/Produtos/Ingredientes: escolhe se
// a análise mostra tudo somado (todas as importações desde o início) ou
// só o período de uma importação específica.
export function PeriodFilter({
    value,
    onChange,
    refreshKey,
}: {
    value: string | null;
    onChange: (importId: string | null) => void;
    refreshKey?: number;
}) {
    const [imports, setImports] = useState<ProductSalesImport[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const store = getActiveStore();
            if (!store) return;

            try {
                setLoading(true);
                // pageSize alto pra trazer todas as importações de uma vez
                // só (o filtro precisa listar todas as opções, diferente
                // da lista paginada da aba Importar).
                const response = await api.get('/product-sales/imports', {
                    params: { storeId: store.id, page: 1, pageSize: 200 },
                });
                const result = response.data as { items?: ProductSalesImport[] };
                setImports(Array.isArray(result?.items) ? result.items : []);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    if (!loading && imports.length <= 1) {
        // Só uma importação (ou nenhuma) — filtro não ajuda em nada ainda.
        return null;
    }

    return (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <CalendarRange size={16} className="shrink-0 text-zinc-400" />
            <select
                value={value ?? 'todos'}
                onChange={(e) =>
                    onChange(e.target.value === 'todos' ? null : e.target.value)
                }
                className="w-full min-w-[220px] bg-transparent text-sm outline-none"
            >
                <option value="todos">Tudo (todas as importações)</option>
                {imports.map((item) => (
                    <option key={item.id} value={item.id}>
                        {formatarNomePadraoImportacao(
                            undefined,
                            item.periodoInicio,
                            item.periodoFim,
                            item.nomeLocal || item.arquivoOriginal,
                        )}{' '}
                        · {item._count.entries} produto(s)
                    </option>
                ))}
            </select>
        </div>
    );
}
