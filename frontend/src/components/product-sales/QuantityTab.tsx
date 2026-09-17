'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getActiveStore } from '@/lib/active-store';
import { Hash, Package, Scale } from 'lucide-react';

type UnidadeMedida = 'KG' | 'UNIDADE';

type Porcao = { gramas: number; quantidade: number };

type IngredienteConsumo = {
    ingredienteId: string;
    ingrediente: string;
    unidadeMedida: UnidadeMedida;
    pesoUnidadeGramas: number | null;
    quantidade: number;
    totalKg: number;
    unidadesEquivalentes: number | null;
    porcoes: Porcao[];
    pratos: { produto: string }[];
};

type IngredientsSummary = {
    ingredientes: IngredienteConsumo[];
};

function formatarNumero(valor: number, casas = 0) {
    return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function formatarGramas(gramas: number) {
    if (gramas >= 1000) {
        return `${formatarNumero(gramas / 1000, 2)} kg`;
    }
    return `${formatarNumero(gramas)} g`;
}

type LinhaPorcao = {
    ingredienteId: string;
    ingrediente: string;
    gramas: number;
    quantidade: number;
};

// Aba focada em "quanto preparar/comprar em unidades" — separado da aba
// Ingredientes (que é centrada em KG). Três blocos:
//  1) Porções por tamanho servido — automático, direto da ficha
//     técnica: cada tamanho de porção vendido (ex: Picanha 200g, Filé
//     Mignon 200g e também 100g no Kids) vira uma linha, sem precisar
//     configurar nada.
//  2) Contados por unidade (Pastel, Coxinha, Costelinha...), configurado
//     na aba Ingredientes.
//  3) Por peso, convertido num único "peça/pacote" configurado na aba
//     Ingredientes — útil pra ingrediente que não tem porção fixa mas
//     tem um pacote de compra fixo (ex: comprado em sacos de 20kg).
export function QuantityTab({
    refreshKey,
    importId,
}: {
    refreshKey?: number;
    importId?: string | null;
}) {
    const [dados, setDados] = useState<IngredientsSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const store = getActiveStore();
            if (!store) return;

            try {
                setLoading(true);

                const response = await api.get('/product-sales/ingredients-summary', {
                    params: { storeId: store.id, importId: importId || undefined },
                });

                setDados(response.data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        }

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, importId]);

    if (!getActiveStore()) {
        return (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                Selecione uma loja ativa no topo do sistema.
            </div>
        );
    }

    const ingredientes = dados?.ingredientes || [];

    const linhasPorcao: LinhaPorcao[] = ingredientes
        .flatMap((item) =>
            (item.porcoes || []).map((porcao) => ({
                ingredienteId: item.ingredienteId,
                ingrediente: item.ingrediente,
                gramas: porcao.gramas,
                quantidade: porcao.quantidade,
            })),
        )
        .sort(
            (a, b) =>
                a.ingrediente.localeCompare(b.ingrediente, 'pt-BR') || b.gramas - a.gramas,
        );

    const itensUnidade = ingredientes.filter((item) => item.unidadeMedida === 'UNIDADE');

    const itensPeca = ingredientes.filter(
        (item) => item.unidadeMedida === 'KG' && item.unidadesEquivalentes != null,
    );

    const tudoVazio =
        linhasPorcao.length === 0 && itensUnidade.length === 0 && itensPeca.length === 0;

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="font-semibold text-zinc-900 dark:text-white">
                    Quantidade a preparar/comprar em unidades
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Consumo do período selecionado convertido pra unidades
                    práticas: quantas porções de cada tamanho foram
                    preparadas (direto da ficha técnica, sem precisar
                    configurar nada), itens contados por unidade (Pastel,
                    Coxinha, Costelinha...) e itens por peso com um
                    peça/pacote de compra configurado.
                </p>
            </div>

            {loading ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Carregando...
                </div>
            ) : tudoVazio ? (
                <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    Nenhum consumo apurado ainda com ficha técnica
                    cadastrada. Configure a ficha técnica dos pratos na aba
                    &quot;Produtos&quot; pra essa lista aparecer.
                </div>
            ) : (
                <>
                    {linhasPorcao.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                                <Scale size={16} className="text-emerald-500" />
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                    Porções por tamanho servido
                                </p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                        <th className="px-4 py-3 font-medium">Ingrediente</th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Tamanho da porção
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Porções vendidas
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {linhasPorcao.map((linha) => (
                                        <tr key={`${linha.ingredienteId}-${linha.gramas}`}>
                                            <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                {linha.ingrediente}
                                            </td>
                                            <td className="px-4 py-3 text-right text-zinc-500">
                                                {formatarGramas(linha.gramas)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                                {formatarNumero(linha.quantidade)} un
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="border-t border-zinc-100 px-4 py-2 text-[11px] text-zinc-400 dark:border-zinc-800">
                                Cada linha é um tamanho de porção diferente
                                usado em algum prato — um mesmo ingrediente
                                pode aparecer mais de uma vez (ex: Filé
                                Mignon 200g no cardápio normal e 100g no
                                Kids).
                            </p>
                        </div>
                    )}

                    {itensUnidade.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                                <Hash size={16} className="text-blue-500" />
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                    Contados por unidade
                                </p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                        <th className="px-4 py-3 font-medium">Ingrediente</th>
                                        <th className="px-4 py-3 text-right font-medium">Pratos</th>
                                        <th className="px-4 py-3 text-right font-medium">Unidades</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {itensUnidade.map((item) => (
                                        <tr key={item.ingredienteId}>
                                            <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                {item.ingrediente}
                                            </td>
                                            <td className="px-4 py-3 text-right text-zinc-500">
                                                {item.pratos.length}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                                {formatarNumero(item.quantidade)} un
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {itensPeca.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                                <Package size={16} className="text-amber-500" />
                                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                    Por peso, convertido num pacote de compra
                                </p>
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-500 dark:border-zinc-800">
                                        <th className="px-4 py-3 font-medium">Ingrediente</th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Total em KG
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Pacote configurado
                                        </th>
                                        <th className="px-4 py-3 text-right font-medium">
                                            Pacotes
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {itensPeca.map((item) => (
                                        <tr key={item.ingredienteId}>
                                            <td className="px-4 py-3 font-medium text-zinc-900 dark:text-white">
                                                {item.ingrediente}
                                            </td>
                                            <td className="px-4 py-3 text-right text-zinc-500">
                                                {formatarNumero(item.quantidade, 2)} kg
                                            </td>
                                            <td className="px-4 py-3 text-right text-zinc-500">
                                                {formatarGramas(item.pesoUnidadeGramas || 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                                                {formatarNumero(item.unidadesEquivalentes || 0)} pç
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
