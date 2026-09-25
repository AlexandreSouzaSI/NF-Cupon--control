'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import {
    CalendarDays,
    CalendarRange,
    ChevronDown,
    ChevronUp,
    Loader2,
    Package,
    Scale,
    ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';

import { formatarNomePadraoImportacao } from './periodo-format';

type Tipo = 'TERCA_QUINTA' | 'SEXTA_SEGUNDA' | 'SEMANA';

type Periodo = { periodoInicio: string; periodoFim: string | null };

type UnidadeMedida = 'KG' | 'LITRO' | 'UNIDADE';

type IngredienteSugestao = {
    ingredienteId: string;
    ingrediente: string;
    unidadeMedida: UnidadeMedida;
    pesoUnidadeGramas: number | null;
    categoriaLista: string | null;
    ordemLista: number | null;
    pico: number;
    sugestao: number;
    unidadesEquivalentesSugestao: number | null;
    ocorrencias: number;
    periodoPico: Periodo | null;
};

// Ordem fixa das categorias da Lista de Compra, do jeito que o chefe de
// produção organiza o pedido — categorias fora dessa lista (nome livre
// digitado na aba Ingredientes) aparecem depois, em ordem alfabética;
// ingrediente sem categoria (categoriaLista null) cai em "Outros", por
// último.
const CATEGORIA_ORDEM_PADRAO = [
    'Proteínas e Cortes',
    'Feijoada',
    'Noite de petiscos',
];
const CATEGORIA_OUTROS = 'Outros';

function agruparPorCategoria(itens: IngredienteSugestao[]) {
    const grupos = new Map<string, IngredienteSugestao[]>();

    for (const item of itens) {
        const chave = item.categoriaLista?.trim() || CATEGORIA_OUTROS;
        const lista = grupos.get(chave);
        if (lista) lista.push(item);
        else grupos.set(chave, [item]);
    }

    for (const lista of grupos.values()) {
        lista.sort((a, b) => {
            const ordemA = a.ordemLista ?? Number.MAX_SAFE_INTEGER;
            const ordemB = b.ordemLista ?? Number.MAX_SAFE_INTEGER;
            if (ordemA !== ordemB) return ordemA - ordemB;
            return a.ingrediente.localeCompare(b.ingrediente, 'pt-BR');
        });
    }

    const chavesRestantes = [...grupos.keys()]
        .filter(
            (chave) =>
                !CATEGORIA_ORDEM_PADRAO.includes(chave) &&
                chave !== CATEGORIA_OUTROS,
        )
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const ordemFinal = [
        ...CATEGORIA_ORDEM_PADRAO,
        ...chavesRestantes,
        CATEGORIA_OUTROS,
    ];

    return ordemFinal
        .filter((categoria) => grupos.has(categoria))
        .map((categoria) => ({
            categoria,
            itens: grupos.get(categoria) as IngredienteSugestao[],
        }));
}

// "Opções vendidas": pico + margens por PRODUTO exato, do jeito que a
// loja já controlava numa planilha manual (nome do prato como vendido,
// já com o tamanho da porção no nome — ex: "Picanha 200g").
type ProdutoSugestao = {
    produtoChave: string;
    produto: string;
    pico: number;
    sugestao10: number;
    sugestao20: number;
    sugestao30: number;
    ocorrencias: number;
    periodoPico: Periodo | null;
};

// "Tamanho": pico + margens por INGREDIENTE + tamanho de porção da
// ficha técnica — junta pratos diferentes que usam o mesmo corte no
// mesmo tamanho (ex: Picanha na Chapa 200g + Picanha no Espeto 200g).
type TamanhoSugestao = {
    ingredienteId: string;
    ingrediente: string;
    gramas: number;
    pico: number;
    sugestao10: number;
    sugestao20: number;
    sugestao30: number;
    ocorrencias: number;
    periodoPico: Periodo | null;
};

type ListaCompraSugerida = {
    tipo: Tipo;
    label: string;
    // Só vem preenchido quando tipo != 'SEMANA' (a soma dos dois padrões
    // não tem uma única "parte do mês" pra mostrar).
    parteMesAlvo?: string;
    usouTodosOsPeriodos?: boolean;
    totalPeriodosConsiderados: number;
    periodos: Periodo[];
    produtos: ProdutoSugestao[];
    tamanhos: TamanhoSugestao[];
    ingredientes: IngredienteSugestao[];
};

const MARGEM_TEXTO = '20%';

function formatarKg(valor: number | null | undefined) {
    return `${(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}

function formatarLitros(valor: number | null | undefined) {
    return `${(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`;
}

function formatarUnidades(valor: number | null | undefined) {
    return `${(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} un`;
}

function formatarGramas(gramas: number) {
    if (gramas >= 1000) {
        return `${(gramas / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
    }
    return `${gramas.toLocaleString('pt-BR')} g`;
}

// "Pico" e "sugestão" já vêm na unidade certa do ingrediente (kg ou
// unidades — ver calcularQuantidade no backend). Pra ingrediente KG com
// peso de peça/pacote configurado, complementa com "≈ N pç".
function formatarQuantidade(
    valor: number,
    unidadeMedida: UnidadeMedida,
    unidadesEquivalentes?: number | null,
) {
    if (unidadeMedida === 'UNIDADE') return formatarUnidades(valor);
    if (unidadeMedida === 'LITRO') return formatarLitros(valor);
    if (unidadesEquivalentes != null) {
        return `${formatarKg(valor)} (≈ ${unidadesEquivalentes} pç)`;
    }
    return formatarKg(valor);
}

const OPCOES: {
    tipo: Tipo;
    label: string;
    descricao: string;
    icon: typeof CalendarDays;
}[] = [
        {
            tipo: 'TERCA_QUINTA',
            label: 'Terça a Quinta',
            descricao: 'Maior saída já registrada num período de Terça a Quinta, mais margem.',
            icon: CalendarDays,
        },
        {
            tipo: 'SEXTA_SEGUNDA',
            label: 'Sexta a Segunda',
            descricao: 'Maior saída já registrada num período de Sexta a Segunda, mais margem.',
            icon: CalendarRange,
        },
        {
            tipo: 'SEMANA',
            label: 'Semana inteira',
            descricao: 'Soma as duas sugestões acima — de terça a segunda.',
            icon: ShoppingCart,
        },
    ];

type Visao = 'PRODUTOS' | 'TAMANHOS' | 'INGREDIENTES';

const VISOES: { visao: Visao; label: string; icon: typeof ShoppingCart }[] = [
    {
        visao: 'INGREDIENTES',
        label: 'Por proteína (KG)',
        icon: Package,
    },
    {
        visao: 'TAMANHOS',
        label: 'Tamanho',
        icon: Scale,
    },
    {
        visao: 'PRODUTOS',
        label: 'Opções vendidas',
        icon: ShoppingCart,
    },
];

// Aba analítica: em vez de média, olha o PICO — o período de maior saída
// já registrado — entre os períodos anteriores que seguem o mesmo
// padrão de dias (Terça a Quinta / Sexta a Segunda) E a mesma parte do
// mês (início/meio/fim, já que início de mês costuma vender diferente
// de fim de mês). Três visões da mesma sugestão:
//  - Por proteína (KG): visão principal — soma TUDO que leva aquele
//    ingrediente (ex: Ancho na chapa + Ancho no espeto vira um Ancho só)
//    e mostra o total em kg a porcionar/comprar. É como rodízio funciona
//    na prática — o corte é preparado e porcionado em bloco, não por
//    prato exato.
//  - Tamanho: mesma soma por ingrediente, mas quebrada por tamanho de
//    porção da ficha técnica (útil só quando o mesmo corte sai em mais
//    de um tamanho, tipo Filé Mignon 200g no normal e 100g no Kids).
//  - Opções vendidas: por produto exato (igual à planilha antiga), com
//    margens de +10/20/30% pra levar em pacotes fechados.
// Só entra proteína (marcada na aba Ingredientes) e item por unidade
// (Pastel, Coxinha...); bebida e acompanhamento ficam de fora.
export function ShoppingListTab() {
    const [tipoAtivo, setTipoAtivo] = useState<Tipo | null>(null);
    const [visao, setVisao] = useState<Visao>('INGREDIENTES');
    const [loading, setLoading] = useState(false);
    const [dados, setDados] = useState<ListaCompraSugerida | null>(null);
    const [mostrarPeriodos, setMostrarPeriodos] = useState(false);

    async function calcular(tipo: Tipo) {
        const store = getActiveStore();
        if (!store) return;

        try {
            setLoading(true);
            setTipoAtivo(tipo);
            setMostrarPeriodos(false);

            const response = await api.get('/product-sales/lista-compra-sugerida', {
                params: { storeId: store.id, tipo },
            });

            setDados(response.data);
        } catch (error: any) {
            const message =
                error?.response?.data?.message ||
                'Erro ao calcular a lista de compra sugerida.';
            toast.error(Array.isArray(message) ? message.join(', ') : message);
            setDados(null);
        } finally {
            setLoading(false);
        }
    }

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    const produtos = dados?.produtos || [];
    const tamanhos = dados?.tamanhos || [];
    const ingredientes = dados?.ingredientes || [];
    const temAlgumaLinha =
        produtos.length > 0 || tamanhos.length > 0 || ingredientes.length > 0;

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-white">
                    Lista de compra sugerida
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Escolha o padrão de período que você vai comprar pra
                    abastecer. O sistema olha todas as importações já feitas
                    que começaram no mesmo dia da semana e na mesma parte do
                    mês (início, meio ou fim — já que início de mês costuma
                    vender diferente de fim de mês) e pega o MAIOR consumo já
                    registrado entre elas. Só entra proteína (carne, marcada
                    como tal na aba Ingredientes) e item contado por unidade
                    (Pastel, Coxinha, Camafeu, Costelinha...) — o resto
                    (acompanhamento, bebida) fica de fora.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {OPCOES.map((opcao) => {
                        const Icon = opcao.icon;
                        const ativo = tipoAtivo === opcao.tipo;
                        const carregandoEsta = loading && ativo;

                        return (
                            <button
                                key={opcao.tipo}
                                onClick={() => calcular(opcao.tipo)}
                                disabled={loading}
                                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${ativo
                                    ? 'border-blue-500/40 bg-blue-500/10'
                                    : 'border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50'
                                    }`}
                            >
                                <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${ativo
                                        ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'
                                        }`}
                                >
                                    {carregandoEsta ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <Icon size={18} />
                                    )}
                                </div>
                                <p className="font-semibold text-zinc-900 dark:text-white">
                                    {opcao.label}
                                </p>
                                <p className="text-xs text-zinc-500">{opcao.descricao}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Calculando...
                </div>
            )}

            {!loading && dados && dados.totalPeriodosConsiderados === 0 && (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Ainda não achei nenhuma importação com período no padrão
                    &quot;{dados.label}&quot;. Pra esse botão funcionar, as
                    importações precisam ter o período (data de início)
                    preenchido — confira na aba &quot;Importar&quot;.
                </div>
            )}

            {!loading &&
                dados &&
                dados.totalPeriodosConsiderados > 0 &&
                !temAlgumaLinha && (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                        Encontrei {dados.totalPeriodosConsiderados} período(s)
                        no padrão &quot;{dados.label}&quot;, mas nenhum prato
                        vendido neles se qualificou ainda. Ou falta cadastrar
                        a ficha técnica do prato na aba &quot;Produtos&quot;,
                        ou falta marcar o ingrediente como &quot;Proteína&quot;
                        na aba &quot;Ingredientes&quot; (só entra proteína ou
                        item contado por unidade, tipo Pastel/Coxinha).
                    </div>
                )}

            {!loading && dados && temAlgumaLinha && (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Baseado em{' '}
                            <span className="font-semibold text-zinc-900 dark:text-white">
                                {dados.totalPeriodosConsiderados} período(s)
                            </span>{' '}
                            já importado(s) no padrão &quot;{dados.label}
                            &quot;
                            {dados.parteMesAlvo ? (
                                <>
                                    {' '}
                                    {dados.usouTodosOsPeriodos ? (
                                        <>
                                            (ainda sem histórico de{' '}
                                            {dados.parteMesAlvo} suficiente —
                                            comparando com todos os períodos
                                            desse padrão)
                                        </>
                                    ) : (
                                        <>de {dados.parteMesAlvo}</>
                                    )}
                                </>
                            ) : null}
                            .
                        </p>

                        <button
                            onClick={() => setMostrarPeriodos((v) => !v)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                            {mostrarPeriodos ? 'Esconder períodos' : 'Ver períodos considerados'}
                            {mostrarPeriodos ? (
                                <ChevronUp size={14} />
                            ) : (
                                <ChevronDown size={14} />
                            )}
                        </button>
                    </div>

                    {mostrarPeriodos && (
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                            {dados.periodos.map((periodo, index) => (
                                <span
                                    key={`${periodo.periodoInicio}-${index}`}
                                    className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                                >
                                    {formatarNomePadraoImportacao(
                                        null,
                                        periodo.periodoInicio,
                                        periodo.periodoFim,
                                        'período sem data',
                                    )}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {VISOES.map((v) => {
                            const Icon = v.icon;
                            const ativo = visao === v.visao;

                            return (
                                <button
                                    key={v.visao}
                                    onClick={() => setVisao(v.visao)}
                                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${ativo
                                        ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                                        : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/50'
                                        }`}
                                >
                                    <Icon size={14} />
                                    {v.label}
                                </button>
                            );
                        })}
                    </div>

                    {visao === 'PRODUTOS' && (
                        <>
                            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                            <th className="px-4 py-3 font-medium">Opção vendida</th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Pico
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">+10%</th>
                                            <th className="px-4 py-3 text-right font-medium">+20%</th>
                                            <th className="px-4 py-3 text-right font-medium">+30%</th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Período do pico
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {produtos.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={6}
                                                    className="px-4 py-8 text-center text-xs text-zinc-500"
                                                >
                                                    Nenhum produto vendido nesse período.
                                                </td>
                                            </tr>
                                        ) : (
                                            produtos.map((item) => (
                                                <tr key={item.produtoChave}>
                                                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                        {item.produto}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-500">
                                                        {formatarUnidades(item.pico)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-300">
                                                        {formatarUnidades(item.sugestao10)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                                        {formatarUnidades(item.sugestao20)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-300">
                                                        {formatarUnidades(item.sugestao30)}
                                                    </td>
                                                    <td className="px-4 py-3 text-left text-xs text-zinc-500">
                                                        {item.periodoPico
                                                            ? formatarNomePadraoImportacao(
                                                                null,
                                                                item.periodoPico.periodoInicio,
                                                                item.periodoPico.periodoFim,
                                                                '—',
                                                            )
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <p className="text-xs text-zinc-500">
                                Cada linha é um prato exatamente como vendido
                                (com o tamanho da porção já no nome, ex:
                                &quot;Picanha 200g&quot;) — igual à planilha
                                manual. &quot;Pico&quot; é a maior quantidade
                                já vendida num único período; +10/20/30% são
                                margens de segurança pra escolher conforme o
                                pacote/fechamento da compra.
                            </p>
                        </>
                    )}

                    {visao === 'TAMANHOS' && (
                        <>
                            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                            <th className="px-4 py-3 font-medium">Ingrediente</th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Tamanho
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">
                                                Pico
                                            </th>
                                            <th className="px-4 py-3 text-right font-medium">+10%</th>
                                            <th className="px-4 py-3 text-right font-medium">+20%</th>
                                            <th className="px-4 py-3 text-right font-medium">+30%</th>
                                            <th className="px-4 py-3 text-left font-medium">
                                                Período do pico
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                        {tamanhos.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={7}
                                                    className="px-4 py-8 text-center text-xs text-zinc-500"
                                                >
                                                    Nenhum ingrediente por peso (kg) nesse
                                                    período.
                                                </td>
                                            </tr>
                                        ) : (
                                            tamanhos.map((item) => (
                                                <tr key={`${item.ingredienteId}-${item.gramas}`}>
                                                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                        {item.ingrediente}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-500">
                                                        {formatarGramas(item.gramas)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-500">
                                                        {formatarUnidades(item.pico)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-300">
                                                        {formatarUnidades(item.sugestao10)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                                        {formatarUnidades(item.sugestao20)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-zinc-600 dark:text-zinc-300">
                                                        {formatarUnidades(item.sugestao30)}
                                                    </td>
                                                    <td className="px-4 py-3 text-left text-xs text-zinc-500">
                                                        {item.periodoPico
                                                            ? formatarNomePadraoImportacao(
                                                                null,
                                                                item.periodoPico.periodoInicio,
                                                                item.periodoPico.periodoFim,
                                                                '—',
                                                            )
                                                            : '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <p className="text-xs text-zinc-500">
                                Cada linha é um tamanho de porção diferente de
                                um mesmo ingrediente (ex: Filé Mignon 200g no
                                cardápio normal e 100g no Kids ficam
                                separados), somando pratos diferentes que
                                usam o mesmo corte no mesmo tamanho. Útil pra
                                saber quantas peças/porções já cortadas
                                naquele tamanho vão ser necessárias.
                            </p>
                        </>
                    )}

                    {visao === 'INGREDIENTES' && (
                        <>
                            {ingredientes.length === 0 ? (
                                <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                                    Nenhum ingrediente apurado nesse período.
                                </div>
                            ) : (
                                agruparPorCategoria(ingredientes).map((grupo) => (
                                    <div key={grupo.categoria} className="space-y-2">
                                        <h4 className="px-1 text-sm font-bold text-zinc-900 dark:text-white">
                                            {grupo.categoria}
                                        </h4>

                                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                                        <th className="px-4 py-3 font-medium">Ingrediente</th>
                                                        <th className="px-4 py-3 text-right font-medium">
                                                            Pico registrado
                                                        </th>
                                                        <th className="px-4 py-3 text-right font-medium">
                                                            Sugestão (+{MARGEM_TEXTO})
                                                        </th>
                                                        <th className="px-4 py-3 text-left font-medium">
                                                            Período do pico
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                                    {grupo.itens.map((item) => (
                                                        <tr key={item.ingredienteId}>
                                                            <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                                {item.ingrediente}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-zinc-500">
                                                                {formatarQuantidade(item.pico, item.unidadeMedida)}
                                                            </td>
                                                            <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                                                {formatarQuantidade(
                                                                    item.sugestao,
                                                                    item.unidadeMedida,
                                                                    item.unidadesEquivalentesSugestao,
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-left text-xs text-zinc-500">
                                                                {item.periodoPico
                                                                    ? formatarNomePadraoImportacao(
                                                                        null,
                                                                        item.periodoPico.periodoInicio,
                                                                        item.periodoPico.periodoFim,
                                                                        '—',
                                                                    )
                                                                    : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))
                            )}

                            <p className="text-xs text-zinc-500">
                                Cada linha soma TUDO que leva aquele
                                ingrediente, não importa o prato (ex: Ancho na
                                chapa + Ancho no espeto viram um Ancho só).
                                &quot;Pico registrado&quot; é o maior consumo
                                que esse ingrediente já teve num único
                                período do padrão &quot;{dados.label}&quot;
                                (em kg ou unidades, conforme configurado na
                                aba Ingredientes). A sugestão soma{' '}
                                {MARGEM_TEXTO} em cima desse pico — é o
                                número pra porcionar/preparar. Os grupos
                                (Proteínas e Cortes, Feijoada, Noite de
                                petiscos...) e a ordem de cada item dentro
                                deles vêm da categoria configurada na aba
                                Ingredientes — ingrediente sem categoria cai
                                em &quot;Outros&quot;.
                            </p>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
