import { request } from 'https';
import { XMLParser } from 'fast-xml-parser';

import { decodeArquivoXml } from './sefaz-nfse-client';
import type { LoadedCertificate } from './sefaz-nfse-client';

// Webservice clássico da NF-e (não confundir com o ADN de NFS-e). Só existe
// endereço de produção nacional único pra esse método específico — não é
// por UF, ao contrário dos webservices de emissão de NF-e.
const PRODUCTION_URL =
    'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const HOMOLOGACAO_URL =
    'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

const SOAP_ACTION =
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';

// Código do IBGE da UF — exigido no pedido (cUFAutor). Não muda com o
// tempo, é dado cadastral estável.
const UF_CODES: Record<string, number> = {
    AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
    MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
    RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

export function ufToCode(uf: string): number {
    const code = UF_CODES[uf.trim().toUpperCase()];

    if (!code) {
        throw new Error(
            `UF "${uf}" não reconhecida. Use a sigla de 2 letras (ex: SP, MG).`,
        );
    }

    return code;
}

type RawResponse = { status: number; body: string };

function soapPost(url: string, xmlBody: string, cert: LoadedCertificate): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(xmlBody, 'utf-8');

        let req: ReturnType<typeof request>;

        try {
            req = request(
                url,
                {
                    method: 'POST',
                    pfx: cert.pfx,
                    passphrase: cert.passphrase,
                    timeout: 20000,
                    headers: {
                        'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
                        'Content-Length': payload.length,
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk) => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            status: res.statusCode || 0,
                            body: Buffer.concat(chunks).toString('utf-8'),
                        });
                    });
                },
            );
        } catch (error) {
            reject(error);
            return;
        }

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('TIMEOUT'));
        });

        req.on('error', (error) => reject(error));
        req.write(payload);
        req.end();
    });
}

// ultNSU precisa vir com 15 dígitos, zero-padded à esquerda (padrão do
// schema distDFeInt da Receita).
function padNsu(nsu: number | bigint): string {
    return String(nsu).padStart(15, '0');
}

function buildEnvelope(params: {
    tpAmb: 1 | 2;
    ufCode: number;
    cnpj: string;
    ultNsu: number | bigint;
}): string {
    const cnpjDigits = params.cnpj.replace(/\D/g, '');

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${params.tpAmb}</tpAmb>
          <cUFAutor>${params.ufCode}</cUFAutor>
          <CNPJ>${cnpjDigits}</CNPJ>
          <distNSU>
            <ultNSU>${padNsu(params.ultNsu)}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => name === 'docZip',
});

// Alguns webservices .asmx devolvem o XML de retorno "cru" (elementos
// aninhados de verdade), outros devolvem como texto com entidades escapadas
// dentro de nfeDistDFeInteresseResult. Tentamos os dois caminhos em vez de
// assumir um só, já que não dá pra testar isso fora de produção.
function findRetDistDFeInt(parsed: any): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;

        if (node.retDistDFeInt) {
            return node.retDistDFeInt;
        }

        for (const key of Object.keys(node)) {
            const value = node[key];

            if (key === '#text' && typeof value === 'string' && value.includes('<retDistDFeInt')) {
                const reparsed = parser.parse(value);
                if (reparsed?.retDistDFeInt) return reparsed.retDistDFeInt;
            }

            if (typeof value === 'object') {
                stack.push(value);
            }
        }
    }

    return null;
}

export type DocZipItem = {
    nsu: string;
    schema: string;
    xml: string;
};

export type DistDFeIntResult = {
    cStat: string;
    xMotivo: string;
    ultNSU: string;
    maxNSU: string;
    docs: DocZipItem[];
};

function extractText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && '#text' in value) return String(value['#text']);
    return '';
}

export async function fetchGoodsDistribution(
    cert: LoadedCertificate,
    params: { cnpj: string; ufCode: number; ultNsu: number | bigint; tpAmb?: 1 | 2 },
): Promise<DistDFeIntResult> {
    const envelope = buildEnvelope({
        tpAmb: params.tpAmb || 1,
        ufCode: params.ufCode,
        cnpj: params.cnpj,
        ultNsu: params.ultNsu,
    });

    const url = params.tpAmb === 2 ? HOMOLOGACAO_URL : PRODUCTION_URL;
    const response = await soapPost(url, envelope, cert);

    let parsed: any;

    try {
        parsed = parser.parse(response.body);
    } catch (error) {
        throw new Error(
            `Resposta da Sefaz não é um XML válido (HTTP ${response.status}): ${truncate(response.body)}`,
        );
    }

    const ret = findRetDistDFeInt(parsed);

    if (!ret) {
        throw new Error(
            `Resposta inesperada da Sefaz (HTTP ${response.status}): ${truncate(response.body)}`,
        );
    }

    const cStat = extractText(ret.cStat);
    const xMotivo = extractText(ret.xMotivo);
    const ultNSU = extractText(ret.ultNSU);
    const maxNSU = extractText(ret.maxNSU);

    const loteRaw = ret.loteDistDFeInt?.docZip;
    const docZipList: any[] = Array.isArray(loteRaw) ? loteRaw : loteRaw ? [loteRaw] : [];

    const docs: DocZipItem[] = docZipList
        .filter((item) => item && item['#text'])
        .map((item) => ({
            nsu: String(item['@_NSU'] || ''),
            schema: String(item['@_schema'] || ''),
            xml: decodeArquivoXml(String(item['#text'])),
        }));

    return { cStat, xMotivo, ultNSU, maxNSU, docs };
}

export type ParsedResNFe = {
    chaveAcesso: string;
    issuerCnpj?: string;
    issuerName?: string;
    value?: number;
    issueDate?: string;
    situacao?: string;
};

// resNFe (ou o resumo dentro de procNFe) traz só os campos essenciais —
// não é a NF-e inteira, mas já é o bastante pra mostrar na lista de
// conciliação (fornecedor, valor, data).
export function parseResNFe(xml: string): ParsedResNFe | null {
    let parsed: any;

    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const res = parsed.resNFe || parsed.resEvento || null;

    if (!res) return null;

    const situacaoMap: Record<string, string> = {
        '1': 'Autorizada',
        '2': 'Cancelada',
        '3': 'Denegada',
    };

    const cSit = extractText(res.cSitNFe);

    return {
        chaveAcesso: extractText(res.chNFe),
        issuerCnpj: extractText(res.CNPJ) || undefined,
        issuerName: extractText(res.xNome) || undefined,
        value: res.vNF != null ? Number(extractText(res.vNF)) : undefined,
        issueDate: extractText(res.dhEmi) || undefined,
        situacao: situacaoMap[cSit] || cSit || undefined,
    };
}

export type NfeConnectionTestResult = {
    success: boolean;
    message: string;
    detail?: string;
    ultNSU?: string;
};

export async function testGoodsConnection(
    cert: LoadedCertificate,
    cnpj: string,
    uf: string,
    ultNsu: number | bigint = 0,
): Promise<NfeConnectionTestResult> {
    try {
        const ufCode = ufToCode(uf);
        const result = await fetchGoodsDistribution(cert, { cnpj, ufCode, ultNsu, tpAmb: 1 });

        if (result.cStat === '137' || result.cStat === '138') {
            return {
                success: true,
                message:
                    result.cStat === '137'
                        ? 'Conexão feita com sucesso. Nenhuma NF-e nova localizada ainda (normal se não houver NF recente).'
                        : `Conexão feita com sucesso. ${result.docs.length} documento(s) localizado(s).`,
                detail: `cStat ${result.cStat}: ${result.xMotivo}`,
                ultNSU: result.ultNSU,
            };
        }

        // 656 = "Consumo Indevido": a Sefaz bloqueia por um tempo quando
        // detecta consultas repetidas partindo do mesmo NSU (normalmente
        // NSU=0) muito seguidas. Não é erro de configuração — é só esperar.
        if (result.cStat === '656') {
            return {
                success: false,
                message:
                    'A Sefaz bloqueou temporariamente por excesso de consultas repetidas (consumo indevido). Espere o tempo indicado por ela antes de tentar de novo — a conexão em si está correta.',
                detail: `cStat ${result.cStat}: ${result.xMotivo}`,
            };
        }

        return {
            success: false,
            message: `A Sefaz respondeu com um status inesperado: ${result.xMotivo || result.cStat}.`,
            detail: `cStat ${result.cStat}`,
        };
    } catch (error: any) {
        return interpretConnectionError(error);
    }
}

function interpretConnectionError(error: any): NfeConnectionTestResult {
    const code = String(error?.code || '');
    const message = String(error?.message || error);
    const lowerMessage = message.toLowerCase();

    if (message === 'TIMEOUT') {
        return {
            success: false,
            message: 'A Sefaz não respondeu a tempo. Tente novamente em alguns minutos.',
        };
    }

    if (
        code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION' ||
        lowerMessage.includes('unsupported pkcs12')
    ) {
        return {
            success: false,
            message:
                'O certificado usa uma criptografia PKCS12 antiga que o Node.js não abre por padrão. É preciso habilitar o provedor legado do OpenSSL.',
            detail: message,
        };
    }

    if (lowerMessage.includes('mac verify') || code.includes('PKCS12_MAC')) {
        return {
            success: false,
            message: 'Não foi possível abrir o certificado. A senha cadastrada provavelmente está incorreta.',
            detail: message,
        };
    }

    return {
        success: false,
        message: 'Erro de conexão com a Sefaz. Verifique sua internet e tente novamente.',
        detail: `${code ? `${code}: ` : ''}${message}`,
    };
}

function truncate(text: string, max = 500) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
}
