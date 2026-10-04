// Tipagem mínima pra "pdf-parse" — o pacote não traz um .d.ts oficial
// atualizado pra todas as versões do @types, então declaramos aqui só o
// que o projeto usa (extrair o texto completo do PDF). Ver uso em
// src/product-sales/meep-catalog-pdf-parser.ts.
declare module 'pdf-parse' {
    interface PdfParseResult {
        text: string;
        numpages: number;
        numrender: number;
        info: Record<string, unknown>;
        metadata: unknown;
        version: string;
    }

    function pdfParse(
        dataBuffer: Buffer,
        options?: Record<string, unknown>,
    ): Promise<PdfParseResult>;

    export = pdfParse;
}
