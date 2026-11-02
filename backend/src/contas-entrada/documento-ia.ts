import { DocumentoLido, documentoVazio } from './documento-parser';

// =============================================================================
// Leitura de boleto / nota ESCANEADOS (foto, PDF do CamScanner, scanner do
// celular) — esses arquivos não têm texto, então a leitura normal volta vazia.
// Aqui a imagem vai para a IA da OpenAI (mesma OPENAI_API_KEY do cadastro por
// voz), que devolve UMA ENTRADA POR CONTA A PAGAR que achar no arquivo (um
// PDF pode ter vários boletos/notas). Depois disso tudo é conferido aqui:
//  - linha digitável do boleto: dígitos verificadores, e valor/vencimento
//    tirados da própria linha (mais confiável que a leitura da imagem);
//  - chave da NF-e: dígito verificador, CNPJ do emitente e número da nota.
// Tudo continua sendo sugestão — o financeiro confere em Lançar Contas.
// =============================================================================

const CHAT_URL = `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
const MODELO = process.env.OPENAI_DOCUMENTOS_MODEL || 'gpt-4.1-mini';

export const iaDocumentosConfigurada = () => Boolean(process.env.OPENAI_API_KEY);

const soDigitos = (t: unknown) => String(t ?? '').replace(/\D/g, '');

// ---------------------------------------------------------------- boleto

function mod10(numero: string): number {
    let soma = 0;
    let peso = 2;
    for (let i = numero.length - 1; i >= 0; i--) {
        let p = Number(numero[i]) * peso;
        if (p > 9) p = Math.floor(p / 10) + (p % 10);
        soma += p;
        peso = peso === 2 ? 1 : 2;
    }
    const resto = soma % 10;
    return resto === 0 ? 0 : 10 - resto;
}

function mod11Boleto(numero: string): number {
    let soma = 0;
    let peso = 2;
    for (let i = numero.length - 1; i >= 0; i--) {
        soma += Number(numero[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const dv = 11 - (soma % 11);
    return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

// Vencimento pelo "fator de vencimento" (dias desde 07/10/1997; a partir de
// 22/02/2025 o fator recomeçou em 1000). Escolhe a data mais perto de hoje.
function vencimentoDoFator(fator: number, hoje = new Date()): string | null {
    if (!fator) return null;
    const dia = 86_400_000;
    const antiga = Date.UTC(1997, 9, 7) + fator * dia;
    const nova = Date.UTC(2025, 1, 22) + (fator - 1000) * dia;
    const ref = hoje.getTime();
    const escolhida = fator >= 1000 && Math.abs(nova - ref) < Math.abs(antiga - ref) ? nova : antiga;
    return new Date(escolhida).toISOString().slice(0, 10);
}

export type LinhaBoleto = { linha: string; valor: number | null; vencimento: string | null; banco: string | null };

// Confere a linha digitável de boleto bancário (47 dígitos) ou de
// convênio/concessionária (48). Volta null se algum dígito não bate.
export function conferirLinhaDigitavel(entrada: unknown): LinhaBoleto | null {
    const l = soDigitos(entrada);
    if (l.length === 47) {
        const c1 = l.slice(0, 9), d1 = Number(l[9]);
        const c2 = l.slice(10, 20), d2 = Number(l[20]);
        const c3 = l.slice(21, 31), d3 = Number(l[31]);
        if (mod10(c1) !== d1 || mod10(c2) !== d2 || mod10(c3) !== d3) return null;
        const dvGeral = Number(l[32]);
        const fator = Number(l.slice(33, 37));
        const valor = Number(l.slice(37, 47)) / 100;
        const codigoBarras = l.slice(0, 4) + dvGeral + l.slice(33, 47) + c1.slice(4) + c2 + c3;
        if (mod11Boleto(codigoBarras.slice(0, 4) + codigoBarras.slice(5)) !== dvGeral) return null;
        return { linha: l, valor: valor > 0 ? valor : null, vencimento: vencimentoDoFator(fator), banco: l.slice(0, 3) };
    }
    if (l.length === 48 && l[0] === '8') {
        const usaMod10 = l[2] === '6' || l[2] === '7';
        for (let i = 0; i < 4; i++) {
            const bloco = l.slice(i * 12, i * 12 + 11);
            const dv = Number(l[i * 12 + 11]);
            const calc = usaMod10 ? mod10(bloco) : (() => {
                let soma = 0, peso = 2;
                for (let j = bloco.length - 1; j >= 0; j--) { soma += Number(bloco[j]) * peso; peso = peso === 9 ? 2 : peso + 1; }
                const r = soma % 11;
                return r === 0 || r === 1 ? 0 : r === 10 ? 1 : 11 - r;
            })();
            if (calc !== dv) return null;
        }
        const barras = [0, 1, 2, 3].map((i) => l.slice(i * 12, i * 12 + 11)).join('');
        const valor = Number(barras.slice(4, 15)) / 100;
        return { linha: l, valor: l[2] === '6' || l[2] === '8' ? (valor > 0 ? valor : null) : null, vencimento: null, banco: null };
    }
    return null;
}

// ---------------------------------------------------------------- NF-e

export function conferirChaveNfe(entrada: unknown): { chave: string; emitente: string; numero: string } | null {
    const c = soDigitos(entrada);
    if (c.length !== 44) return null;
    let soma = 0;
    let peso = 2;
    for (let i = 42; i >= 0; i--) {
        soma += Number(c[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const r = soma % 11;
    const dv = r < 2 ? 0 : 11 - r;
    if (dv !== Number(c[43])) return null;
    return { chave: c, emitente: c.slice(6, 20), numero: String(Number(c.slice(25, 34))) };
}

// ---------------------------------------------------------------- IA

const ESQUEMA = {
    name: 'contas_no_documento',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['contas'],
        properties: {
            contas: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['tipoDocumento', 'fornecedor', 'fornecedorDoc', 'pagadorNome', 'pagadorDoc', 'valor', 'vencimento', 'emissao',
                        'numeroDocumento', 'linhaDigitavel', 'chaveNfe', 'descricao', 'parcelas', 'paginas'],
                    properties: {
                        tipoDocumento: { type: 'string', enum: ['BOLETO', 'NFE', 'NFSE', 'OUTRO', 'COMPROVANTE'] },
                        fornecedor: { type: ['string', 'null'] },
                        fornecedorDoc: { type: ['string', 'null'] },
                        pagadorNome: { type: ['string', 'null'] },
                        pagadorDoc: { type: ['string', 'null'] },
                        valor: { type: ['number', 'null'] },
                        vencimento: { type: ['string', 'null'] },
                        emissao: { type: ['string', 'null'] },
                        numeroDocumento: { type: ['string', 'null'] },
                        linhaDigitavel: { type: ['string', 'null'] },
                        chaveNfe: { type: ['string', 'null'] },
                        descricao: { type: ['string', 'null'] },
                        parcelas: {
                            type: 'array',
                            items: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['numero', 'vencimento', 'valor'],
                                properties: {
                                    numero: { type: ['string', 'null'] },
                                    vencimento: { type: ['string', 'null'] },
                                    valor: { type: ['number', 'null'] },
                                },
                            },
                        },
                        paginas: { type: 'array', items: { type: 'integer' } },
                    },
                },
            },
        },
    },
} as const;

const INSTRUCOES = `Você lê documentos de contas a pagar de um bar/restaurante no Brasil: boletos bancários, DANFE (NF-e), notas de serviço, faturas de água/luz/telefone, guias de imposto. O arquivo pode ser foto ou scanner e pode ter VÁRIOS documentos (várias páginas).

IMPORTANTE: o arquivo pode vir de um grupo de WhatsApp com fotos de tudo. Só interessam BOLETO, NOTA FISCAL (DANFE/NFS-e/cupom fiscal), FATURA/conta de consumo, GUIA DE IMPOSTO e COMPROVANTE DE PAGAMENTO. Se o arquivo for qualquer outra coisa (foto de produto, oferta/propaganda, cardápio, foto de pessoa/lugar, print de conversa, figurinha, documento pessoal, planilha de preços, orçamento sem cobrança), devolva "contas": [] — não invente nada.

Devolva uma entrada em "contas" para cada CONTA A PAGAR diferente:
- CADA BOLETO É UMA CONTA. Boletos diferentes do MESMO fornecedor, com o MESMO vencimento, continuam sendo contas SEPARADAS (ex.: NF 1974997 de R$ 37,97 e NF 1974996 de R$ 528,17 = 2 contas). O que diferencia: linha digitável, "Nosso Número", "Número do Documento", NF e valor.
- Uma página de boleto costuma repetir o MESMO boleto 3 vezes (Declaração do pagador / Recibo do pagador / Ficha de compensação): isso é UM boleto só. Confira cada página do arquivo, uma por uma.
- Boleto + a DANFE da mesma compra (mesmo fornecedor e MESMO número de NF) = UMA conta só. Use o vencimento, o valor e a linha digitável do boleto, e a chave da NF-e da DANFE. tipoDocumento = "BOLETO".
- DANFE sozinha = uma conta (tipoDocumento "NFE"). Se tiver FATURA/DUPLICATAS, liste em "parcelas" (número, vencimento, valor) e use a 1ª como vencimento. Se não tiver duplicata nem boleto, vencimento = null e valor = VALOR TOTAL DA NOTA.
- Boleto sozinho = uma conta.
- Canhoto ou página em branco: ignore.
- Se o arquivo for só COMPROVANTE de pagamento já feito (Pix, transferência, boleto pago), devolva UMA entrada com tipoDocumento "COMPROVANTE": fornecedor = quem recebeu, valor = valor pago, vencimento = data do pagamento, pagadorDoc = CNPJ de quem pagou.

Campos:
- fornecedor: razão social de quem RECEBE o dinheiro (beneficiário/cedente do boleto ou EMITENTE da nota), como está escrito. fornecedorDoc: CNPJ/CPF dele.
- pagadorNome / pagadorDoc: quem PAGA = "Pagador"/"Sacado" no boleto ou DESTINATÁRIO na DANFE. É o CNPJ da nossa loja — leia com muita atenção.
- valor: valor do documento / valor cobrado, em reais (número, ponto decimal).
- vencimento, emissao: formato AAAA-MM-DD.
- numeroDocumento: o NÚMERO DA NOTA FISCAL, só o número (sem série/parcela/zeros à esquerda) — no boleto costuma vir como "NF:1974997-1" ou no Nº do documento "001974997-001" → "1974997". Se não houver NF, o "Nº do documento" do boleto.
- linhaDigitavel: a linha digitável do boleto (47 ou 48 dígitos, a sequência numérica no topo do boleto), só dígitos. Se não der para ler TODOS os dígitos com certeza, devolva null.
- chaveNfe: a "CHAVE DE ACESSO" da DANFE (44 dígitos), só dígitos; null se não estiver legível.
- descricao: resumo curto (ex.: "NF 52591 — salsinha e coentro").
- paginas: números das páginas (começando em 1) onde a conta aparece.
- CNPJ/CPF, linha digitável e chave: só dígitos.
Nunca invente: o que não estiver legível fica null.`;

type ContaIa = {
    tipoDocumento: DocumentoLido['tipoDocumento'];
    fornecedor: string | null;
    fornecedorDoc: string | null;
    pagadorNome: string | null;
    pagadorDoc: string | null;
    valor: number | null;
    vencimento: string | null;
    emissao: string | null;
    numeroDocumento: string | null;
    linhaDigitavel: string | null;
    chaveNfe: string | null;
    descricao: string | null;
    parcelas: { numero: string | null; vencimento: string | null; valor: number | null }[];
    paginas: number[];
};

const dataIso = (v: unknown) => {
    const s = String(v ?? '');
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const docValido = (d: unknown) => {
    const s = soDigitos(d);
    return s.length === 14 || s.length === 11 ? s : null;
};

// Transforma a resposta da IA em DocumentoLido (já conferido).
export function contaIaParaDocumento(c: ContaIa, total: number): DocumentoLido {
    const d = documentoVazio();
    d.tipoDocumento = c.tipoDocumento ?? 'OUTRO';
    d.fornecedor = c.fornecedor?.trim() || null;
    d.fornecedorDoc = docValido(c.fornecedorDoc);
    d.valor = typeof c.valor === 'number' && c.valor > 0 ? Math.round(c.valor * 100) / 100 : null;
    d.vencimento = dataIso(c.vencimento);
    d.emissao = dataIso(c.emissao);
    d.numeroDocumento = c.numeroDocumento?.trim() || null;
    d.parcelas = (c.parcelas ?? [])
        .map((p) => ({ numero: p.numero ?? undefined, vencimento: dataIso(p.vencimento) ?? '', valor: Number(p.valor) || 0 }))
        .filter((p) => p.vencimento && p.valor > 0);

    const avisos: string[] = [];

    const linha = c.linhaDigitavel ? conferirLinhaDigitavel(c.linhaDigitavel) : null;
    if (linha) {
        d.codigoBarras = linha.linha;
        // A linha digitável manda: valor e vencimento saem dela.
        if (linha.valor) d.valor = linha.valor;
        if (linha.vencimento) d.vencimento = linha.vencimento;
    } else if (c.linhaDigitavel) {
        avisos.push('linha digitável lida com erro — confira o código de barras');
    }

    const chave = c.chaveNfe ? conferirChaveNfe(c.chaveNfe) : null;
    if (chave) {
        d.chaveNfe = chave.chave;
        if (!d.fornecedorDoc) d.fornecedorDoc = chave.emitente;
        if (!d.numeroDocumento) d.numeroDocumento = chave.numero;
    }

    if (!d.vencimento && d.parcelas[0]) d.vencimento = d.parcelas[0].vencimento;

    // CNPJ da loja (pagador/destinatário) primeiro — é por ele que a conta
    // vai para a loja certa.
    const pagador = docValido(c.pagadorDoc);
    d.documentos = [pagador].filter(Boolean) as string[];

    const paginas = (c.paginas ?? []).filter((p) => Number.isInteger(p) && p > 0);
    d.descricao = [
        c.descricao?.trim() || null,
        total > 1 && paginas.length ? `pág. ${paginas.join(', ')}` : null,
        c.pagadorNome && !pagador ? `pagador: ${c.pagadorNome}` : null,
        avisos.length ? `⚠ ${avisos.join('; ')}` : null,
    ].filter(Boolean).join(' · ') || null;
    return d;
}

// Lê o arquivo com a IA. Volta null se a IA não está configurada.
// Uma chamada à IA (um PDF inteiro, uma página ou uma imagem).
async function chamarIa(key: string, anexo: unknown, dica: string): Promise<ContaIa[]> {
    const resposta = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: MODELO,
            temperature: 0,
            response_format: { type: 'json_schema', json_schema: ESQUEMA },
            messages: [
                { role: 'system', content: INSTRUCOES },
                { role: 'user', content: [{ type: 'text', text: dica }, anexo] },
            ],
        }),
        signal: AbortSignal.timeout(180_000),
    });
    if (!resposta.ok) {
        const corpo = await resposta.text().catch(() => '');
        throw new Error(`IA respondeu ${resposta.status}: ${corpo.slice(0, 300)}`);
    }
    const json: any = await resposta.json();
    const conteudo = json?.choices?.[0]?.message?.content;
    const lido = JSON.parse(conteudo || '{}') as { contas?: ContaIa[] };
    return (lido.contas ?? []).filter((c) => c && (c.valor || c.linhaDigitavel || c.chaveNfe || c.fornecedor));
}

const anexoPdf = (buffer: Buffer | Uint8Array, nome: string) => ({
    type: 'file',
    file: { filename: nome.endsWith('.pdf') ? nome : `${nome}.pdf`, file_data: `data:application/pdf;base64,${Buffer.from(buffer).toString('base64')}` },
});

// Separa um PDF em PDFs de uma página só.
async function separarPaginas(buffer: Buffer): Promise<Uint8Array[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFDocument } = require('pdf-lib');
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = doc.getPageCount();
    const saida: Uint8Array[] = [];
    for (let i = 0; i < total; i++) {
        const novo = await PDFDocument.create();
        const [pagina] = await novo.copyPages(doc, [i]);
        novo.addPage(pagina);
        saida.push(await novo.save());
    }
    return saida;
}

// Junta o que foi lido página a página: a mesma linha digitável/chave vira
// uma conta só; a DANFE (sem boleto) de uma página se junta ao boleto da mesma
// NF de outra página.
function juntarPaginas(contas: ContaIa[]): ContaIa[] {
    const so = (t: unknown) => String(t ?? '').replace(/\D/g, '');
    const numero = (t: unknown) => { const m = /(\d{1,9})/.exec(String(t ?? '').replace(/^\D*/, '')); return m ? String(Number(m[1])) : ''; };
    const lista: ContaIa[] = [];
    for (const c of contas) {
        const linha = so(c.linhaDigitavel);
        const chave = so(c.chaveNfe);
        const igual = lista.find((x) => (linha && so(x.linhaDigitavel) === linha) || (!linha && !so(x.linhaDigitavel) && chave && so(x.chaveNfe) === chave));
        if (igual) {
            igual.paginas = [...new Set([...(igual.paginas ?? []), ...(c.paginas ?? [])])];
            igual.chaveNfe ||= c.chaveNfe;
            continue;
        }
        lista.push({ ...c });
    }
    // DANFE sozinha + boleto da mesma NF (mesmo fornecedor) = uma conta.
    for (const nfe of lista.filter((c) => c.tipoDocumento === 'NFE' && !so(c.linhaDigitavel))) {
        const boleto = lista.find((b) => b !== nfe && so(b.linhaDigitavel) && numero(b.numeroDocumento) && numero(b.numeroDocumento) === numero(nfe.numeroDocumento)
            && (!so(b.fornecedorDoc) || !so(nfe.fornecedorDoc) || so(b.fornecedorDoc) === so(nfe.fornecedorDoc)));
        if (!boleto) continue;
        boleto.chaveNfe ||= nfe.chaveNfe;
        boleto.paginas = [...new Set([...(boleto.paginas ?? []), ...(nfe.paginas ?? [])])];
        lista.splice(lista.indexOf(nfe), 1);
    }
    return lista;
}

// Lê o arquivo com a IA. Volta null se a IA não está configurada.
// PDF com várias páginas: cada página é lida separadamente (assim um boleto
// nunca "some" porque a IA olhou só a primeira página) e depois junta.
export async function lerDocumentoComIa(file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<DocumentoLido[] | null> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;

    const nome = file.originalname || 'documento';
    const ehPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(nome);
    let contas: ContaIa[];

    let paginas: Uint8Array[] = [];
    if (ehPdf) {
        try {
            paginas = await separarPaginas(file.buffer);
        } catch {
            paginas = [];
        }
    }

    if (paginas.length > 1) {
        const lidas: ContaIa[][] = new Array(paginas.length);
        // Até 3 páginas ao mesmo tempo.
        let proxima = 0;
        await Promise.all(Array.from({ length: Math.min(3, paginas.length) }, async () => {
            while (proxima < paginas.length) {
                const i = proxima++;
                const daPagina = await chamarIa(key, anexoPdf(paginas[i], `${nome.replace(/\.pdf$/i, '')}-p${i + 1}.pdf`),
                    `Esta é a página ${i + 1} de ${paginas.length} de um arquivo. Leia as contas a pagar DESTA página.`);
                lidas[i] = daPagina.map((c) => ({ ...c, paginas: [i + 1] }));
            }
        }));
        contas = juntarPaginas(lidas.flat());
    } else {
        const anexo = ehPdf
            ? anexoPdf(file.buffer, nome)
            : { type: 'image_url', image_url: { url: `data:${file.mimetype || 'image/jpeg'};base64,${file.buffer.toString('base64')}`, detail: 'high' } };
        contas = juntarPaginas(await chamarIa(key, anexo, 'Leia as contas a pagar deste arquivo.'));
    }

    const docs = contas.map((c) => contaIaParaDocumento(c, contas.length));
    // A mesma linha digitável / chave lida duas vezes = uma conta só.
    const vistos = new Set<string>();
    return docs.filter((d) => {
        const k = d.codigoBarras || d.chaveNfe;
        if (!k) return true;
        if (vistos.has(k)) return false;
        vistos.add(k);
        return true;
    });
}
