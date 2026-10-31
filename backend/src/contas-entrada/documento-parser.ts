import { XMLParser } from 'fast-xml-parser';

// =============================================================================
// Lê um BOLETO ou uma NOTA (PDF com texto, ou XML de NF-e) e devolve o que der
// pra sugerir na conta a pagar. Tudo é sugestão: o financeiro confere e
// corrige antes de lançar. Foto/PDF escaneado não tem texto -> volta vazio.
// =============================================================================

export type ParcelaLida = { vencimento: string; valor: number; numero?: string }; // vencimento YYYY-MM-DD

export type DocumentoLido = {
    tipoDocumento: 'BOLETO' | 'NFE' | 'NFSE' | 'OUTRO';
    fornecedor: string | null;
    fornecedorDoc: string | null; // CNPJ/CPF só números
    valor: number | null;
    vencimento: string | null; // YYYY-MM-DD
    emissao: string | null;
    numeroDocumento: string | null;
    codigoBarras: string | null; // linha digitável (só números)
    chaveNfe: string | null;
    descricao: string | null;
    parcelas: ParcelaLida[];
    // Todos os CNPJ/CPF achados no documento (só números) — serve pra achar a
    // loja (CNPJ do pagador / destinatário).
    documentos: string[];
};

export const documentoVazio = (): DocumentoLido => ({
    tipoDocumento: 'OUTRO', fornecedor: null, fornecedorDoc: null, valor: null, vencimento: null, emissao: null,
    numeroDocumento: null, codigoBarras: null, chaveNfe: null, descricao: null, parcelas: [], documentos: [],
});

// CNPJ (com ou sem pontuação) e CPF formatado, sem repetir.
export function documentosNoTexto(texto: string): string[] {
    const out = new Set<string>();
    for (const m of (texto ?? '').matchAll(/(?<!\d)(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})(?!\d)/g)) out.add(m[1].replace(/\D/g, ''));
    for (const m of (texto ?? '').matchAll(/(?<!\d)(\d{3}\.\d{3}\.\d{3}-\d{2})(?!\d)/g)) out.add(m[1].replace(/\D/g, ''));
    return [...out];
}

const numBR = (t?: string | null): number | null => {
    if (!t) return null;
    const n = Number(t.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
};
const dataBR = (t?: string | null): string | null => {
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t ?? '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const soDigitos = (t?: string | null) => (t ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------------------
// Linha digitável de boleto bancário (47 dígitos) e de concessionária (48).
// ---------------------------------------------------------------------------

// Fator de vencimento: reiniciou em 22/02/2025 (fator 1000). Escolhe a data
// (ciclo antigo ou novo) mais perto de hoje.
function dataDoFator(fator: number, hoje = new Date()): string | null {
    if (!fator) return null;
    const antigo = new Date(Date.UTC(1997, 9, 7) + fator * 86400000);
    const novo = new Date(Date.UTC(2025, 1, 22) + (fator - 1000) * 86400000);
    const d = Math.abs(antigo.getTime() - hoje.getTime()) < Math.abs(novo.getTime() - hoje.getTime()) ? antigo : novo;
    return iso(d);
}

export function lerLinhaDigitavel(texto: string): { codigo: string; valor: number | null; vencimento: string | null } | null {
    const t = texto.replace(/\r/g, '');
    // Bancário: 5.5 5.6 5.6 1 14  (aceita sem pontos/espaços)
    const banc = /(\d{5})[.\s]?(\d{5})\s*(\d{5})[.\s]?(\d{6})\s*(\d{5})[.\s]?(\d{6})\s*(\d)\s*(\d{14})/.exec(t);
    if (banc) {
        const codigo = banc.slice(1).join('');
        const fator = Number(codigo.slice(33, 37));
        const valor = Number(codigo.slice(37)) / 100;
        return { codigo, valor: valor > 0 ? valor : null, vencimento: dataDoFator(fator) };
    }
    // Concessionária/tributo: 4 blocos de 11+1 começando com 8
    const conc = /\b(8\d{10})[\s-]?(\d)\s*(\d{11})[\s-]?(\d)\s*(\d{11})[\s-]?(\d)\s*(\d{11})[\s-]?(\d)\b/.exec(t);
    if (conc) {
        const codigo = conc.slice(1).join('');
        const barras = conc[1] + conc[3] + conc[5] + conc[7];
        const valorReal = barras[2] === '6' || barras[2] === '8';
        const valor = valorReal ? Number(barras.slice(4, 15)) / 100 : 0;
        return { codigo, valor: valor > 0 ? valor : null, vencimento: null };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Texto de PDF (boleto, DANFE, NFS-e)
// ---------------------------------------------------------------------------

export function lerTextoDocumento(textoBruto: string): DocumentoLido {
    const texto = (textoBruto ?? '').replace(/\r/g, '');
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    const r = documentoVazio();
    r.documentos = documentosNoTexto(texto);
    const achar = (re: RegExp) => re.exec(texto)?.[1]?.trim() ?? null;
    const proximaLinha = (re: RegExp) => {
        const i = linhas.findIndex((l) => re.test(l));
        return i >= 0 ? linhas[i + 1] ?? null : null;
    };

    const linha = lerLinhaDigitavel(texto);
    const chave = /(\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4})/.exec(texto)?.[1];
    const ehDanfe = /DANFE|DOCUMENTO AUXILIAR DA NOTA FISCAL/i.test(texto);
    const ehNfse = /NFS-?e|NOTA FISCAL (ELETR[ÔO]NICA )?DE SERVI[ÇC]O/i.test(texto);

    if (linha && !ehDanfe) {
        r.tipoDocumento = 'BOLETO';
        r.codigoBarras = linha.codigo;
        r.valor = linha.valor;
        r.vencimento = linha.vencimento;

        // Beneficiário: na mesma linha ("Beneficiário: X") ou na linha de baixo do rótulo.
        let benef = achar(/Benefici[áa]rio\s*:\s*([^\n]+)/i);
        if (!benef || /^CNPJ|^Ag[êe]ncia/i.test(benef)) benef = proximaLinha(/^Benefici[áa]rio\b(?!\s*final)/i);
        if (benef) {
            const doc = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})/.exec(benef)?.[1];
            r.fornecedorDoc = doc ? soDigitos(doc) : null;
            r.fornecedor = benef.replace(/CNPJ.*$|CPF.*$/i, '').replace(/\s*-\s*$/, '').replace(/Ag[êe]ncia.*$/i, '').trim() || null;
        }
        if (!r.fornecedorDoc) {
            const cnpjs = [...texto.matchAll(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/g)].map((m) => soDigitos(m[1]));
            if (cnpjs[0]) r.fornecedorDoc = cnpjs[0];
        }
        if (!r.vencimento) r.vencimento = dataBR(proximaLinha(/^Vencimento/i) ?? achar(/Vencimento[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i));
        if (!r.valor) r.valor = numBR(achar(/Valor do Documento[^\d]{0,40}([\d.]+,\d{2})/i));
        r.emissao = dataBR(achar(/Data do documento[\s\S]{0,80}?(\d{2}\/\d{2}\/\d{4})/i));
        const nDoc = proximaLinha(/^N[úu]m\.? do documento/i) ?? achar(/N[úu]m\.? do documento\s*:?\s*([\w\-/]+)/i);
        r.numeroDocumento = nDoc && /^[\w\-/]{1,20}$/.test(nDoc) ? nDoc : null;
        r.descricao = linhas.find((l) => /REFERENTE|MENSALIDADE|PARCELA|FATURA|NF\s*\d/i.test(l) && !/JUROS|MULTA|BENEFICI/i.test(l)) ?? null;
        return r;
    }

    if (ehDanfe || ehNfse) {
        r.tipoDocumento = ehDanfe ? 'NFE' : 'NFSE';
        r.chaveNfe = chave ? soDigitos(chave) : null;
        r.numeroDocumento = achar(/N[º°o]\.?\s*:?\s*(\d[\d.]*)/i)?.replace(/\./g, '') ?? null;
        r.emissao = dataBR(achar(/(?:DATA D[AE] EMISS[ÃA]O|Emiss[ãa]o)[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i));
        r.valor = numBR(
            achar(/VALOR TOTAL DA NOTA[^\d]{0,40}([\d.]+,\d{2})/i) ??
            achar(/Valor L[íi]quido[^\d]{0,40}([\d.]+,\d{2})/i) ??
            achar(/Valor (?:Total )?(?:dos )?Servi[çc]os?[^\d]{0,40}([\d.]+,\d{2})/i),
        );
        r.fornecedor = ehDanfe
            ? (proximaLinha(/RECEBEMOS DE/i) ? achar(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i) : null) ?? linhas[0] ?? null
            : achar(/(?:Prestador|Raz[ãa]o Social)[^:\n]*:\s*([^\n]+)/i);
        const doc = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/.exec(texto)?.[1];
        r.fornecedorDoc = r.chaveNfe ? r.chaveNfe.slice(6, 20) : doc ? soDigitos(doc) : null;
        // Duplicatas do DANFE: "001 10/11/2026 1.234,56"
        for (const m of texto.matchAll(/\b(\d{3})\s+(\d{2}\/\d{2}\/\d{4})\s+(?:R\$\s*)?([\d.]+,\d{2})/g)) {
            const v = numBR(m[3]);
            const d = dataBR(m[2]);
            if (v && d) r.parcelas.push({ numero: m[1], vencimento: d, valor: v });
        }
        r.vencimento = r.parcelas[0]?.vencimento ?? null;
        if (linha) r.codigoBarras = linha.codigo;
        return r;
    }

    // Qualquer outro PDF: tenta ao menos um valor e uma data.
    r.valor = numBR(achar(/(?:Total|Valor)[^\d\n]{0,30}R?\$?\s*([\d.]+,\d{2})/i) ?? achar(/R\$\s*([\d.]+,\d{2})/));
    r.vencimento = dataBR(achar(/Vencimento[^\d]{0,30}(\d{2}\/\d{2}\/\d{4})/i));
    r.emissao = dataBR(achar(/(\d{2}\/\d{2}\/\d{4})/));
    return r;
}

// ---------------------------------------------------------------------------
// XML de NF-e (nfeProc) e NFS-e padrão nacional (só o básico)
// ---------------------------------------------------------------------------

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true, parseTagValue: false, isArray: (n) => n === 'dup' });
const txt = (v: any): string => (v === undefined || v === null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v)).trim();

export function lerXmlDocumento(conteudo: string): DocumentoLido {
    const r = documentoVazio();
    let raiz: any;
    try { raiz = xml.parse(conteudo); } catch { return r; }

    const nfe = raiz?.nfeProc?.NFe?.infNFe ?? raiz?.NFe?.infNFe;
    if (nfe) {
        r.tipoDocumento = 'NFE';
        r.documentos = [txt(nfe.dest?.CNPJ) || txt(nfe.dest?.CPF), txt(nfe.emit?.CNPJ) || txt(nfe.emit?.CPF)].filter(Boolean);
        r.fornecedor = txt(nfe.emit?.xNome) || null;
        r.fornecedorDoc = txt(nfe.emit?.CNPJ) || txt(nfe.emit?.CPF) || null;
        r.numeroDocumento = txt(nfe.ide?.nNF) || null;
        r.emissao = txt(nfe.ide?.dhEmi ?? nfe.ide?.dEmi).slice(0, 10) || null;
        r.chaveNfe = txt(nfe['@_Id']).replace(/^NFe/i, '') || null;
        r.valor = Number(txt(nfe.total?.ICMSTot?.vNF)) || null;
        const liquido = Number(txt(nfe.cobr?.fat?.vLiq));
        if (liquido > 0) r.valor = liquido;
        r.parcelas = (nfe.cobr?.dup ?? [])
            .map((d: any) => ({ numero: txt(d.nDup), vencimento: txt(d.dVenc).slice(0, 10), valor: Number(txt(d.vDup)) }))
            .filter((p: ParcelaLida) => p.vencimento && p.valor > 0);
        r.vencimento = r.parcelas[0]?.vencimento ?? null;
        const prod = nfe.det?.[0]?.prod ?? nfe.det?.prod;
        r.descricao = r.numeroDocumento ? `NF ${r.numeroDocumento}${prod?.xProd ? ` — ${txt(prod.xProd)}` : ''}` : null;
        return r;
    }

    const nfse = raiz?.NFSe?.infNFSe;
    if (nfse) {
        r.tipoDocumento = 'NFSE';
        r.documentos = [txt(nfse.DPS?.infDPS?.toma?.CNPJ) || txt(nfse.DPS?.infDPS?.toma?.CPF), txt(nfse.emit?.CNPJ)].filter(Boolean);
        r.fornecedor = txt(nfse.emit?.xNome) || null;
        r.fornecedorDoc = txt(nfse.emit?.CNPJ) || txt(nfse.emit?.CPF) || null;
        r.numeroDocumento = txt(nfse.nNFSe) || null;
        r.valor = Number(txt(nfse.valores?.vLiq)) || null;
        r.emissao = txt(nfse.dhProc).slice(0, 10) || null;
        r.descricao = r.numeroDocumento ? `NFS-e ${r.numeroDocumento}` : null;
        return r;
    }
    return r;
}
