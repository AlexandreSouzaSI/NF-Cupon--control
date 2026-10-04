// Parser do relatório "Produtos" exportado do PAINEL da Meep (PDF) — não
// confundir com a API de vendas da Meep (essa sim não traz categoria
// nenhuma, ver CATEGORIA_PADRAO em meep-product-sales-sync.service.ts).
// Esse relatório de produtos É a única fonte que a loja tem pra saber a
// categoria real de cada item (bebida, grelhados, entradas etc.) — o
// usuário baixa esse PDF no painel da Meep (loja por loja, ex: "Produtos
// Contagem Meep.pdf") e importa aqui pra alimentar o catálogo
// (ProductCatalogItem) usado tanto pra classificar vendas Meep retroativas
// quanto pra alimentar a lista de pratos da Ficha Técnica.
//
// IMPORTANTE sobre o texto extraído do PDF: o pdf-parse devolve as células
// da tabela GRUDADAS, sem espaço nem quebra de linha entre elas na maioria
// das linhas — ex: "ABACAXI3da94e17-...COMPLEMENTOS220890005102" é UMA
// linha só (produto+uuid+categoria+NCM+CEST+CFOP concatenados). Só quando a
// categoria é longa demais pra caber ela quebra em 2-3 linhas (ex:
// "ALMOÇO NU GALHO DE \nSEXTA A DOMINGO 1130 \nAS 1600\n210690905102"), daí
// o código NCM+CEST+CFOP vira uma linha própria, só com dígitos/pontos.
// Por isso o parser NÃO separa por espaço/linha pra achar os campos — ele
// usa o uuid (sempre presente e sem ambiguidade) e o bloco de dígitos do
// NCM/CEST/CFOP (sempre >= 12 dígitos corridos, categoria nunca tem uma
// sequência tão longa de números) como âncoras, e pega tudo que sobra entre
// elas.
//
// Linhas sem nenhum código numérico depois do uuid (ex: "Abertura de
// Comanda", "Ativação", "Desativação", "Pagamento", "Fechamento de
// Comanda", "Gorjeta", "Taxa de Entrega", "Valor variável", "Taxa de
// Serviço") são operacionais da própria Meep, não produto de cardápio —
// são descartadas (ficam sem categoria).
//
// Validado contra o PDF real da loja Contagem: 482 produtos com categoria
// válida, em 30 categorias distintas (BEBIDAS, GRELHADOS, COMBOS, DOSES,
// VINHOS/ESPUM, SOBREMESAS, DRINKS, CERVEJA, COMPLEMENTOS etc).

import pdfParse from 'pdf-parse';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// NCM+CEST+CFOP concatenados sempre formam uma sequência de pelo menos 12
// dígitos corridos (8 do NCM + 4 do CFOP, no mínimo) — categoria nunca tem
// um número tão comprido (os únicos dígitos que aparecem em categoria são
// coisas tipo "1130"/"1600" de horário, no máximo 4 dígitos seguidos).
const CODIGO_FISCAL_RE = /[0-9][0-9.]{5,}[0-9]/;

function collapseSpaces(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

// Mesma normalização usada em product-sales.service.ts e em
// meep-product-sales-sync.service.ts (maiúsculo, sem espaço duplicado) —
// repetida aqui porque este parser não deve depender de nenhum dos dois
// módulos, só concordar no FORMATO da chave.
function normalizarProduto(nome: string): string {
    return nome.toString().trim().toUpperCase().replace(/\s+/g, ' ');
}

// Remove o boilerplate repetido por página (rodapé "N de 46", cabeçalho
// "Produtos" + data/hora da exportação, nome/endereço/telefone da loja, a
// segunda tabela de Valor/Código de barras/Habilitado/Código Interno que
// não nos interessa, e o cabeçalho de coluna da página seguinte) — sem
// isso, esse texto fica grudado no nome/categoria do produto vizinho.
function stripBoilerplate(text: string): string {
    // Cinco linhas depois de "Produtos": data por extenso, timestamp, razão
    // social, endereço e telefone da loja. NÃO depender do texto da razão
    // social — cada loja tem a sua ("NU GALHO LTDA", "NU GALHO RAIZ LTDA"...).
    const footerBlock =
        /\d{1,3}\s+de\s+\d{1,3}\nProdutos\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n*/g;

    let out = text.replace(footerBlock, '\n');
    out = out.replace(/ValorCodigo de barrasHabilitadoCodigo Interno\n/g, '');
    out = out.replace(/^R\$[^\n]*\n/gm, '');
    out = out.replace(/^ProdutoProdutoIdCategoriaNCMCESTCFOP\n/gm, '');
    return out;
}

export type MeepCatalogParsedItem = { produto: string; categoria: string };

// Faz o parsing de um texto JÁ EXTRAÍDO do PDF (separado do pdf-parse pra
// poder testar essa lógica isoladamente, sem depender de extração real).
export function parseMeepCatalogText(rawText: string): MeepCatalogParsedItem[] {
    const cleaned = stripBoilerplate(rawText);
    const matches = [...cleaned.matchAll(UUID_RE)];

    const brutos: MeepCatalogParsedItem[] = [];
    let cursor = 0;

    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const uuidStart = m.index as number;
        const uuidEnd = uuidStart + m[0].length;

        // Nome do produto = tudo que sobrou desde o fim do código fiscal do
        // produto ANTERIOR (ou do início do texto) até o início deste uuid.
        const produto = collapseSpaces(cleaned.slice(cursor, uuidStart));

        const proximoUuidStart =
            i + 1 < matches.length ? (matches[i + 1].index as number) : cleaned.length;
        const segmento = cleaned.slice(uuidEnd, proximoUuidStart);

        const codigoFiscal = segmento.match(CODIGO_FISCAL_RE);

        let categoria = '';
        if (codigoFiscal) {
            categoria = collapseSpaces(
                segmento
                    .slice(0, codigoFiscal.index)
                    // marcador de "sem CEST" tipo "ENTRADAS FRIAS -21069090"
                    .replace(/-\s*$/, ''),
            );
            cursor = uuidEnd + (codigoFiscal.index as number) + codigoFiscal[0].length;
        } else {
            // Sem nenhum código fiscal depois do uuid = item operacional da
            // Meep (Abertura de Comanda, Pagamento, etc.) — sem categoria,
            // descartado no filtro abaixo.
            cursor = uuidEnd;
        }

        if (produto && categoria) {
            brutos.push({ produto, categoria });
        }
    }

    // Dedup por nome normalizado — mantém a primeira categoria encontrada
    // pra cada produto (o relatório pode repetir o mesmo nome em
    // categorias/ids diferentes; ficamos com a primeira ocorrência).
    const vistos = new Set<string>();
    const resultado: MeepCatalogParsedItem[] = [];

    for (const item of brutos) {
        const chave = normalizarProduto(item.produto);
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        resultado.push(item);
    }

    return resultado;
}

// Extrai o texto do PDF (pdf-parse) e aplica o parsing acima. É essa
// função que product-sales.service.ts chama de verdade.
export async function parseMeepCatalogPdf(
    buffer: Buffer,
): Promise<MeepCatalogParsedItem[]> {
    const parsed = await pdfParse(buffer);
    return parseMeepCatalogText(parsed.text);
}
