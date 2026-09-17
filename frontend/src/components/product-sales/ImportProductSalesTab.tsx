'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    Check,
    ChefHat,
    Download,
    Eraser,
    FileSpreadsheet,
    Loader2,
    Pencil,
    RotateCcw,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Pagination } from '../ui/Pagination';
import { formatarNomePadraoImportacao } from './periodo-format';

type ProductSalesImport = {
    id: string;
    nomeLocal: string | null;
    exportadoPor: string | null;
    exportadoEm: string | null;
    periodoInicio: string | null;
    periodoFim: string | null;
    arquivoOriginal: string;
    totalLinhas: number;
    createdAt: string;
    importedBy?: { name: string } | null;
    _count: { entries: number };
};

type ResultadoImportacaoReceitas = {
    totalPratos: number;
    totalIngredientes: number;
};

const PAGE_SIZE = 10;

function formatarDataHora(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR');
}

// "2026-09-01T12:00:00.000Z" -> "2026-09-01", pro value do <input
// type="date">. Usa toISOString (sempre UTC) porque a data foi salva com
// horário fixo em UTC (ver parseDateInput no backend), então não corre
// risco de recuar um dia por causa do fuso do navegador.
function paraInputDate(iso: string | null) {
    if (!iso) return '';
    return new Date(iso).toISOString().slice(0, 10);
}

export function ImportProductSalesTab({
    onImported,
}: {
    onImported?: () => void;
}) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{
        atual: number;
        total: number;
    } | null>(null);

    // Importação em massa das fichas técnicas a partir de uma planilha
    // (coluna A = prato, colunas seguintes = "Ingrediente - Gramatura").
    const recipeFileInputRef = useRef<HTMLInputElement>(null);
    const [importandoReceitas, setImportandoReceitas] = useState(false);
    const [resultadoReceitas, setResultadoReceitas] =
        useState<ResultadoImportacaoReceitas | null>(null);
    const [desfazendoReceitas, setDesfazendoReceitas] = useState(false);
    const [undoDisponivel, setUndoDisponivel] = useState(false);
    const [baixandoModelo, setBaixandoModelo] = useState(false);
    const [limpandoReceitas, setLimpandoReceitas] = useState(false);
    const [imports, setImports] = useState<ProductSalesImport[]>([]);
    const [loading, setLoading] = useState(true);
    const [periodoInicio, setPeriodoInicio] = useState('');
    const [periodoFim, setPeriodoFim] = useState('');

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Edição inline: id da importação sendo editada + valores do form.
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [editInicio, setEditInicio] = useState('');
    const [editFim, setEditFim] = useState('');
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);

    async function loadImports(paginaAlvo = page) {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            const response = await api.get('/product-sales/imports', {
                params: { storeId: store.id, page: paginaAlvo, pageSize: PAGE_SIZE },
            });
            const result = response.data as {
                items: ProductSalesImport[];
                total: number;
            };
            setImports(Array.isArray(result?.items) ? result.items : []);
            setTotal(result?.total ?? 0);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadImports(page);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    useEffect(() => {
        async function carregarStatusUndo() {
            const store = getActiveStore();
            if (!store) return;

            try {
                const response = await api.get('/product-sales/recipes-undo-status', {
                    params: { storeId: store.id },
                });
                setUndoDisponivel(!!response.data?.disponivel);
            } catch (error) {
                console.error(error);
            }
        }

        carregarStatusUndo();
    }, []);

    function iniciarEdicao(item: ProductSalesImport) {
        setEditandoId(item.id);
        setEditInicio(paraInputDate(item.periodoInicio));
        setEditFim(paraInputDate(item.periodoFim));
    }

    function cancelarEdicao() {
        setEditandoId(null);
        setEditInicio('');
        setEditFim('');
    }

    async function salvarEdicao(id: string) {
        if (!editInicio || !editFim) {
            toast.error('Informe o período (de/até).');
            return;
        }

        try {
            setSalvandoEdicao(true);

            await api.put(`/product-sales/imports/${id}`, {
                periodoInicio: editInicio,
                periodoFim: editFim,
            });

            toast.success('Período atualizado.');
            cancelarEdicao();
            await loadImports(page);
            onImported?.();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao atualizar a importação.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setSalvandoEdicao(false);
        }
    }

    // Importa UM arquivo (mesma chamada de sempre) — reaproveitado tanto
    // pro upload de um arquivo só quanto pro loop de vários de uma vez,
    // pra garantir que cada planilha é processada exatamente igual ao
    // fluxo de hoje (1 por vez), só que disparadas em sequência.
    async function importarUmArquivo(file: File, incluirPeriodoManual: boolean) {
        const store = getActiveStore();
        if (!store) throw new Error('Selecione uma loja ativa no topo do sistema.');

        const formData = new FormData();
        formData.append('storeId', store.id);
        formData.append('file', file);

        // Período é opcional — se ficar em branco, o backend tenta ler
        // do nome do arquivo (ex: "Anchieta dia 21 a 24 de agosto").
        if (incluirPeriodoManual) {
            if (periodoInicio) formData.append('periodoInicio', periodoInicio);
            if (periodoFim) formData.append('periodoFim', periodoFim);
        }

        const response = await api.post('/product-sales/import', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        return response.data as ProductSalesImport;
    }

    async function handleUpload(fileList: FileList | null) {
        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        if (!fileList || fileList.length === 0) return;

        const todosArquivos = Array.from(fileList);
        const validos = todosArquivos.filter((f) =>
            f.name.toLowerCase().endsWith('.xlsx'),
        );
        const ignorados = todosArquivos.length - validos.length;

        if (ignorados > 0) {
            toast.error(
                todosArquivos.length === 1
                    ? 'Envie um arquivo .xlsx.'
                    : `${ignorados} arquivo(s) ignorado(s) — só aceito .xlsx.`,
            );
        }

        if (validos.length === 0) return;

        // Com mais de um arquivo selecionado, cada planilha tem seu
        // próprio período (lido do nome dela) — o período preenchido
        // acima só faz sentido quando é um arquivo só.
        const usarPeriodoManual = validos.length === 1;

        try {
            setUploading(true);

            let sucesso = 0;
            let ultimoResultado: ProductSalesImport | null = null;
            const falhas: { nome: string; motivo: string }[] = [];

            for (let i = 0; i < validos.length; i++) {
                if (validos.length > 1) {
                    setUploadProgress({ atual: i + 1, total: validos.length });
                }

                try {
                    // Sequencial (não em paralelo) de propósito — evita
                    // sobrecarregar o backend com várias planilhas
                    // grandes ao mesmo tempo.
                    // eslint-disable-next-line no-await-in-loop
                    ultimoResultado = await importarUmArquivo(
                        validos[i],
                        usarPeriodoManual,
                    );
                    sucesso += 1;
                } catch (error: any) {
                    const message =
                        error?.response?.data?.message || 'Erro ao importar.';
                    falhas.push({
                        nome: validos[i].name,
                        motivo: Array.isArray(message) ? message.join(', ') : message,
                    });
                }
            }

            if (validos.length === 1 && sucesso === 1 && ultimoResultado) {
                const periodoDetectado =
                    ultimoResultado.periodoInicio && ultimoResultado.periodoFim
                        ? formatarNomePadraoImportacao(
                            undefined,
                            ultimoResultado.periodoInicio,
                            ultimoResultado.periodoFim,
                            '',
                        )
                        : '';

                toast.success(
                    `${ultimoResultado.totalLinhas} produto(s) importado(s)${periodoDetectado ? ` — ${periodoDetectado}` : ''
                    }.`,
                );
            } else if (sucesso > 0) {
                toast.success(
                    `${sucesso} de ${validos.length} planilha(s) importada(s).`,
                );
            }

            falhas.forEach((falha) => {
                toast.error(`${falha.nome}: ${falha.motivo}`);
            });

            setPeriodoInicio('');
            setPeriodoFim('');

            // Importação nova entra no topo (ordenada por mais recente) —
            // volta pra página 1 pra ela aparecer na hora.
            if (page === 1) {
                await loadImports(1);
            } else {
                setPage(1);
            }

            if (sucesso > 0) onImported?.();
        } finally {
            setUploading(false);
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    // Importa fichas técnicas em massa a partir de uma planilha no formato
    // padrão: coluna A = prato, colunas seguintes = "Ingrediente -
    // Gramatura" por célula, dados a partir da linha 2. Sempre substitui a
    // ficha técnica que já existir — por isso o backend guarda um backup
    // antes de aplicar, que dá pra desfazer logo depois.
    async function handleUploadReceitas(fileList: FileList | null) {
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
        formData.append('storeId', store.id);
        formData.append('file', file);

        try {
            setImportandoReceitas(true);

            const response = await api.post(
                '/product-sales/import-recipes-excel',
                formData,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );

            const resultado = response.data as ResultadoImportacaoReceitas;
            setResultadoReceitas(resultado);
            setUndoDisponivel(true);

            toast.success(
                `${resultado.totalPratos} ficha(s) técnica(s) atualizada(s).`,
            );
            onImported?.();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao importar a planilha.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setImportandoReceitas(false);
            if (recipeFileInputRef.current) recipeFileInputRef.current.value = '';
        }
    }

    // Baixa a planilha modelo já com a coluna A preenchida (nome de cada
    // produto que já tem venda importada nesta loja) — evita erro de
    // digitação do nome do prato na hora de reimportar.
    async function handleBaixarModelo() {
        const store = getActiveStore();

        if (!store) {
            toast.error('Selecione uma loja ativa no topo do sistema.');
            return;
        }

        try {
            setBaixandoModelo(true);

            const response = await api.get('/product-sales/recipe-template', {
                params: { storeId: store.id },
                responseType: 'blob',
            });

            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = 'fichas-tecnicas-modelo.xlsx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch (error: any) {
            // responseType: 'blob' faz o corpo de erro do backend chegar
            // como Blob em vez de JSON já parseado.
            let message = 'Erro ao gerar a planilha modelo.';
            const data = error?.response?.data;

            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    const parsed = JSON.parse(text);
                    message = Array.isArray(parsed?.message)
                        ? parsed.message.join(', ')
                        : parsed?.message || message;
                } catch {
                    // corpo não é JSON — mantém a mensagem genérica
                }
            }

            toast.error(message);
        } finally {
            setBaixandoModelo(false);
        }
    }

    // Apaga TODAS as fichas técnicas da loja — pra quem prefere começar
    // do zero antes de importar uma planilha nova (evita ficha antiga
    // sobrando de um prato que não veio na nova planilha). Tira backup
    // antes, então "Desfazer última importação" também reverte isso.
    async function handleLimparReceitas() {
        const store = getActiveStore();
        if (!store) return;

        if (
            !confirm(
                'Apagar TODAS as fichas técnicas desta loja? Os ingredientes cadastrados continuam existindo, só as receitas dos pratos somem. Dá pra desfazer logo em seguida.',
            )
        ) {
            return;
        }

        try {
            setLimpandoReceitas(true);

            const response = await api.delete('/product-sales/recipes', {
                params: { storeId: store.id },
            });

            toast.success(
                `${response.data?.removidos ?? 0} linha(s) de ficha técnica apagada(s).`,
            );
            setResultadoReceitas(null);
            setUndoDisponivel(true);
            onImported?.();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao limpar as fichas técnicas.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setLimpandoReceitas(false);
        }
    }

    async function handleDesfazerReceitas() {
        const store = getActiveStore();
        if (!store) return;

        if (
            !confirm(
                'Desfazer a última importação de fichas técnicas? Isso restaura as receitas como estavam antes dela.',
            )
        ) {
            return;
        }

        try {
            setDesfazendoReceitas(true);

            const response = await api.post('/product-sales/recipes-undo', {
                storeId: store.id,
            });

            toast.success(
                `Fichas técnicas restauradas (${response.data?.restaurados ?? 0} linha(s)).`,
            );
            setResultadoReceitas(null);
            setUndoDisponivel(false);
            onImported?.();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao desfazer a importação.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        } finally {
            setDesfazendoReceitas(false);
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Apagar essa importação? Os produtos dela somem da análise.')) {
            return;
        }

        try {
            await api.delete(`/product-sales/imports/${id}`);
            toast.success('Importação removida.');

            // Apagou o último item da página atual (e não é a primeira) —
            // volta uma página pra não ficar numa página vazia.
            const voltarPagina = imports.length === 1 && page > 1;

            if (voltarPagina) {
                setPage(page - 1);
            } else {
                await loadImports(page);
            }

            onImported?.();
        } catch (error: any) {
            const message =
                error?.response?.data?.message || 'Erro ao remover a importação.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
        }
    }

    return (
        <div className="space-y-5">
            <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">
                        Importar planilha de vendas
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Suba o Excel exportado do sistema de vendas/comanda
                        (categoria, produto, quantidade e valor por item).
                        Pode importar de novo sempre que quiser atualizar, e
                        pode selecionar vários arquivos de uma vez — cada um
                        vira uma importação separada, igual seria importando
                        um por um.
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Esse Excel é do dia... (início, opcional)
                        </label>
                        <input
                            type="date"
                            value={periodoInicio}
                            onChange={(e) => setPeriodoInicio(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                        />
                    </div>

                    <div className="flex-1">
                        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            ...até o dia (fim, opcional)
                        </label>
                        <input
                            type="date"
                            value={periodoFim}
                            onChange={(e) => setPeriodoFim(e.target.value)}
                            className="w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
                        />
                    </div>

                    <label
                        className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-5 font-semibold sm:mb-0 ${uploading
                            ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-600'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                            }`}
                    >
                        {uploading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Upload size={18} />
                        )}
                        {uploading && uploadProgress
                            ? `Importando ${uploadProgress.atual}/${uploadProgress.total}...`
                            : 'Importar Excel'}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx"
                            multiple
                            disabled={uploading}
                            className="hidden"
                            onChange={(e) => handleUpload(e.target.files)}
                        />
                    </label>
                </div>

                <p className="text-xs text-zinc-500">
                    Deixando as datas em branco, tentamos ler o período
                    direto do nome do arquivo (ex: &quot;Anchieta dia 21 a 24
                    de agosto&quot;). Se não conseguirmos, o período fica em
                    branco e dá pra corrigir depois na lista abaixo. Ao
                    selecionar vários arquivos de uma vez, os campos de data
                    acima são ignorados — o período de cada um vem sempre do
                    nome do próprio arquivo.
                </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">
                        Importar fichas técnicas (planilha)
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Suba uma planilha .xlsx no padrão: coluna A = nome do
                        prato; colunas B, C, D... = um ingrediente por
                        célula, no formato &quot;Ingrediente - Gramatura&quot;
                        (ex: &quot;Picanha - 400&quot;), quantas colunas
                        forem precisas. Dados a partir da linha 2 (linha 1 é
                        cabeçalho). Cada prato da planilha substitui a ficha
                        técnica que já existir pra ele.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handleBaixarModelo}
                        disabled={baixandoModelo}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-zinc-200 px-5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                        {baixandoModelo ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Download size={18} />
                        )}
                        Baixar modelo (produtos atuais)
                    </button>

                    <label
                        className={`inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-5 font-semibold ${importandoReceitas
                            ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-600'
                            : 'border-blue-500/30 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400'
                            }`}
                    >
                        {importandoReceitas ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <ChefHat size={18} />
                        )}
                        {importandoReceitas ? 'Importando...' : 'Importar fichas técnicas'}
                        <input
                            ref={recipeFileInputRef}
                            type="file"
                            accept=".xlsx"
                            disabled={importandoReceitas}
                            className="hidden"
                            onChange={(e) => handleUploadReceitas(e.target.files)}
                        />
                    </label>

                    <button
                        onClick={handleLimparReceitas}
                        disabled={limpandoReceitas}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 font-semibold text-rose-600 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400"
                    >
                        {limpandoReceitas ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Eraser size={18} />
                        )}
                        Limpar tudo
                    </button>

                    {undoDisponivel && (
                        <button
                            onClick={handleDesfazerReceitas}
                            disabled={desfazendoReceitas}
                            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 font-semibold text-amber-600 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-amber-400"
                        >
                            {desfazendoReceitas ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <RotateCcw size={18} />
                            )}
                            Desfazer última importação
                        </button>
                    )}
                </div>

                {resultadoReceitas && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300">
                        {resultadoReceitas.totalPratos} prato(s) atualizado(s) ·{' '}
                        {resultadoReceitas.totalIngredientes} ingrediente(s) no
                        total.
                    </div>
                )}
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
                    <p className="font-semibold text-zinc-900 dark:text-white">
                        Importações anteriores
                    </p>
                </div>

                {loading ? (
                    <div className="p-6 text-center text-sm text-zinc-500">
                        Carregando...
                    </div>
                ) : imports.length === 0 ? (
                    <div className="p-6 text-center text-sm text-zinc-500">
                        Nenhuma planilha importada ainda.
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {imports.map((item) => {
                            const emEdicao = editandoId === item.id;

                            return (
                                <div key={item.id} className="p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                                <FileSpreadsheet size={18} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                                    {formatarNomePadraoImportacao(
                                                        getActiveStore()?.name,
                                                        item.periodoInicio,
                                                        item.periodoFim,
                                                        item.nomeLocal || item.arquivoOriginal,
                                                    )}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    {item.arquivoOriginal}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                    {item.totalLinhas} produto(s) · exportado em{' '}
                                                    {formatarDataHora(item.exportadoEm)} · importado em{' '}
                                                    {formatarDataHora(item.createdAt)}
                                                    {item.importedBy?.name
                                                        ? ` por ${item.importedBy.name}`
                                                        : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {!emEdicao && (
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    onClick={() => iniciarEdicao(item)}
                                                    title="Alterar período"
                                                    className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    title="Remover importação"
                                                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-500/10 hover:text-red-500"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {emEdicao && (
                                        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50 sm:flex-row sm:items-end">
                                            <div className="flex-1">
                                                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                                    Início
                                                </label>
                                                <input
                                                    type="date"
                                                    value={editInicio}
                                                    onChange={(e) => setEditInicio(e.target.value)}
                                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </div>

                                            <div className="flex-1">
                                                <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                                    Fim
                                                </label>
                                                <input
                                                    type="date"
                                                    value={editFim}
                                                    onChange={(e) => setEditFim(e.target.value)}
                                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                                />
                                            </div>

                                            <div className="flex shrink-0 gap-2">
                                                <button
                                                    onClick={() => salvarEdicao(item.id)}
                                                    disabled={salvandoEdicao}
                                                    title="Salvar"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                                                >
                                                    {salvandoEdicao ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Check size={16} />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={cancelarEdicao}
                                                    disabled={salvandoEdicao}
                                                    title="Cancelar"
                                                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {!loading && imports.length > 0 && (
                    <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
                        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                    </div>
                )}
            </div>
        </div>
    );
}
