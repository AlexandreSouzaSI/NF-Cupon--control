'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { toast } from 'sonner';
import { Download, Loader2, Upload } from 'lucide-react';

type Resultado = {
    totalLinhas: number;
    criados: number;
    atualizados: number;
    entradasLancadas: number;
};

export function ImportEstoqueTab({ onImported }: { onImported: () => void }) {
    const [baixando, setBaixando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    async function baixarModelo() {
        try {
            setBaixando(true);
            const response = await api.get('/estoque/modelo', { responseType: 'blob' });

            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'estoque-modelo.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            toast.error('Erro ao gerar a planilha modelo.');
        } finally {
            setBaixando(false);
        }
    }

    async function importar(fileList: FileList | null) {
        const store = getActiveStore();
        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        const file = fileList?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            toast.error('Envie um arquivo .xlsx.');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('storeId', store.id);

        try {
            setImportando(true);
            const response = await api.post('/estoque/importar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setResultado(response.data);
            toast.success('Planilha importada.');
            onImported();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'Erro ao importar a planilha.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setImportando(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    }

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="mb-1 text-sm font-semibold text-zinc-900 dark:text-white">
                    Planilha modelo
                </p>
                <p className="mb-3 text-xs text-zinc-500">
                    Colunas: <strong>Nome</strong> (obrigatório), Categoria, Quantidade
                    e Valor — as três últimas são opcionais. Nome cadastra ou atualiza
                    o item; se vier Quantidade, já lança uma <strong>entrada</strong>{' '}
                    que soma no saldo atual (reimportar a mesma planilha soma de novo,
                    não substitui).
                </p>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={baixarModelo}
                        disabled={baixando}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                        {baixando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Baixar modelo
                    </button>

                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                        {importando ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                        Importar planilha
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".xlsx"
                            className="hidden"
                            disabled={importando}
                            onChange={(e) => importar(e.target.files)}
                        />
                    </label>
                </div>
            </div>

            {resultado && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xl font-bold text-zinc-900 dark:text-white">{resultado.totalLinhas}</p>
                        <p className="text-xs text-zinc-500">Linhas lidas</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xl font-bold text-emerald-600">{resultado.criados}</p>
                        <p className="text-xs text-zinc-500">Itens criados</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xl font-bold text-blue-500">{resultado.atualizados}</p>
                        <p className="text-xs text-zinc-500">Itens atualizados</p>
                    </div>
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-center dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-xl font-bold text-zinc-900 dark:text-white">{resultado.entradasLancadas}</p>
                        <p className="text-xs text-zinc-500">Entradas lançadas</p>
                    </div>
                </div>
            )}
        </div>
    );
}
