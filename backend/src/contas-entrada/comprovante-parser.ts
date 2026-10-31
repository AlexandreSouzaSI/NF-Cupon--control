import { documentosNoTexto } from './documento-parser';

// Lê o TEXTO de um comprovante Pix em PDF (Sicredi e layouts parecidos) e
// devolve o que der pra extrair. Tudo opcional: se não achar, o campo vem
// vazio e a pessoa/financeiro preenche à mão.
export type DadosComprovante = {
    valor: number | null;
    data: string | null; // YYYY-MM-DD
    destinatario: string | null;
    descricao: string | null;
    idTransacao: string | null;
    documentos: string[];
};

function numero(txt: string): number | null {
    const n = Number(txt.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseTextoComprovante(textoBruto: string): DadosComprovante {
    const texto = (textoBruto ?? '').replace(/\r/g, '');
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    const achar = (re: RegExp) => texto.match(re)?.[1]?.trim() ?? null;

    // Valor: "Valor: R$ 700,00" (Sicredi) ou "Valor pago/do pagamento R$ ..."
    const valorTxt =
        achar(/Valor(?:\s+(?:pago|do pagamento|da transfer[êe]ncia))?\s*:?\s*R\$\s*([\d.]+,\d{2})/i) ??
        achar(/R\$\s*([\d.]+,\d{2})/);

    // Data: "Realizado em: 24/10/2026" ou qualquer primeira data do documento
    const dataTxt =
        achar(/Realizado em:?\s*(\d{2}\/\d{2}\/\d{4})/i) ??
        achar(/(?:Data|Efetivado em|Pago em)[^\d]{0,15}(\d{2}\/\d{2}\/\d{4})/i) ??
        achar(/(\d{2}\/\d{2}\/\d{4})/);
    const data = dataTxt ? `${dataTxt.slice(6, 10)}-${dataTxt.slice(3, 5)}-${dataTxt.slice(0, 2)}` : null;

    const destinatario =
        achar(/Nome do destinat[áa]rio:\s*(.+)/i) ??
        achar(/(?:Favorecido|Benefici[áa]rio|Recebedor|Para)\s*:\s*(.+)/i);

    // Descrição digitada pelo pagador: no Sicredi é a linha logo acima de "Valor:"
    let descricao: string | null = null;
    const iValor = linhas.findIndex((l) => /^Valor:/i.test(l));
    if (iValor > 0) {
        const anterior = linhas[iValor - 1];
        if (!/^Comprovante/i.test(anterior)) descricao = anterior;
    }
    descricao = descricao ?? achar(/(?:Descri[çc][ãa]o|Mensagem)\s*:\s*(.+)/i);

    const idTransacao =
        achar(/ID da transa[çc][ãa]o:\s*(\S+)/i) ??
        achar(/Autentica[çc][ãa]o(?: Eletr[ôo]nica)?:\s*([A-Za-z0-9.\-]+)/i);

    return {
        valor: valorTxt ? numero(valorTxt) : null,
        data,
        destinatario: destinatario ? destinatario.replace(/\s{2,}.*/, '') : null,
        descricao,
        idTransacao,
        documentos: documentosNoTexto(texto),
    };
}
