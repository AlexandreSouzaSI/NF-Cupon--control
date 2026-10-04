// Regras compartilhadas entre "Vendas Meep -> Itens por Dia"
// (MeepQueryService.itemsPerDay), a ponte que alimenta Venda/Lista
// (MeepProductSalesSyncService.rebuildBusinessDay) e o diagnóstico de
// conferência entre as duas telas. Ficam num lugar só de propósito: as
// duas telas leem os MESMOS MeepOrderItem, então qualquer diferença de
// fórmula (ex: uma multiplicar por quantidade e a outra não) vira
// divergência de valor que ninguém consegue explicar olhando a tela.

// Valor de UMA linha de item vendido. Usa o `total` que a Meep mandou
// quando existe (já considera quantidade/desconto/acréscimo); se vier
// nulo, cai em valor unitário x quantidade — NUNCA só o valor unitário
// (era o que o Itens por Dia fazia, e subestimava qualquer linha com
// quantidade > 1 e total nulo).
export function meepItemValue(item: {
    total?: unknown;
    unitValue?: unknown;
    quantity?: unknown;
}): number {
    if (item.total != null) {
        const total = Number(item.total);
        if (Number.isFinite(total)) return total;
    }

    const unit = Number(item.unitValue ?? 0);
    const quantidade = Number(item.quantity ?? 0);
    const valor = unit * quantidade;

    return Number.isFinite(valor) ? valor : 0;
}

// Chave de produto: maiúsculo, sem espaço duplicado. É o MESMO formato
// de normalizarProduto() em product-sales.service.ts (Venda/Lista agrupa
// por essa chave) — usar a mesma chave nas duas telas evita que
// "Heineken 600ml" e "HEINEKEN  600ML" contem como 2 produtos distintos
// de um lado e 1 do outro.
export function normalizarProdutoChave(nome: string): string {
    return nome
        .toString()
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ');
}

// Linhas que a análise de Venda/Lista descarta (taxa de serviço, couvert)
// — o Itens por Dia da Meep mostra tudo cru. Exportado aqui pra o
// diagnóstico comparar maçã com maçã ("com" e "sem" essas linhas).
export const PALAVRAS_EXCLUIDAS_DA_ANALISE = ['TAXA DE SERVIÇO', 'COUVERT'];

export function produtoExcluidoDaAnalise(produtoChave: string): boolean {
    return PALAVRAS_EXCLUIDAS_DA_ANALISE.some((palavra) =>
        produtoChave.includes(palavra),
    );
}
