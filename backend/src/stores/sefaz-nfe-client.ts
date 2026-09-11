import { request } from 'https';
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

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

function soapPost(
    url: string,
    xmlBody: string,
    cert: LoadedCertificate,
    soapAction: string = SOAP_ACTION,
): Promise<RawResponse> {
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
                        'Content-Type': `application/soap+xml; charset=utf-8; action="${soapAction}"`,
                        // Alguns webservices estaduais (implementação Java/
                        // Apache CXF — ex: MG, GO, MT, MS, PE, AM) só
                        // despacham o método olhando o header clássico
                        // SOAPAction (padrão SOAP 1.1), mesmo recebendo um
                        // envelope SOAP 1.2. Sem isso, respondem "Não é
                        // possível localizar o método de despacho" mesmo
                        // com o envelope correto. Mandar os dois não quebra
                        // os serviços .asmx (SVRS/RS/SP/BA) que já
                        // funcionavam só com o action no Content-Type.
                        SOAPAction: `"${soapAction}"`,
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
    // Sem isso, o fast-xml-parser converte automaticamente qualquer texto
    // "parece número" pra JS number — inclusive a chave de acesso (44
    // dígitos), que estoura a precisão de um double e vira notação
    // científica (ex: "3.126076e+43") quando reconvertida pra string. Todo
    // valor numérico que a gente realmente precisa (vNF, datas etc.) já
    // passa por Number(extractText(...)) explicitamente, então manter tudo
    // como string aqui é seguro.
    parseTagValue: false,
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

// ---------------------------------------------------------------------
// Manifestação do destinatário (Ciência da Operação)
//
// Quando a Sefaz só devolve o resumo (resNFe) de uma NF de entrada — o que
// acontece por padrão pra quem consulta como destinatário — o XML completo
// com os itens só é liberado depois que o destinatário "se manifesta"
// eletronicamente sobre aquela nota. O evento mais simples e seguro de
// automatizar é a "Ciência da Operação" (tpEvento 210210): ele só declara
// que a loja está ciente de que a nota existe, sem confirmar recebimento —
// mas já é o suficiente pra Sefaz parar de restringir o XML completo nas
// próximas consultas de distribuição.
//
// Webservice usado: NFeRecepcaoEvento4, da mesma UF autorizadora do
// destinatário (mesma lógica de cUFAutor já usada na distribuição). Fonte
// dos endereços: https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos (portal
// oficial da SVRS, que lista o webservice de cada UF + o fallback
// nacional). Só os endereços de produção estão aqui, já que o resto do
// cliente Sefaz deste projeto também só opera em produção.
const RECEPCAO_EVENTO_URLS: Record<string, string> = {
    AM: 'https://nfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
    BA: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    GO: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
    MG: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
    MS: 'https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
    MT: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4',
    PE: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
    PR: 'https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4',
    RS: 'https://nfe.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
    SP: 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
};

// UFs sem endereço próprio confirmado acima usam o webservice de eventos
// compartilhado da SVRS (é o que o próprio portal da SVRS documenta como
// "Webservice geral de Eventos... utilizado para Manifestação do
// Destinatário e outros tipos de Eventos"). Se uma loja cadastrada numa
// UF fora da lista acima receber erro de conexão aqui, confira o endereço
// específico dessa UF no portal e adicione na tabela.
const RECEPCAO_EVENTO_SVRS_FALLBACK =
    'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx';

function getRecepcaoEventoUrl(uf: string): string {
    return RECEPCAO_EVENTO_URLS[uf.trim().toUpperCase()] || RECEPCAO_EVENTO_SVRS_FALLBACK;
}

const RECEPCAO_EVENTO_ACTION =
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento';

const TP_EVENTO_DESCRICAO: Record<string, string> = {
    '210200': 'Confirmacao da Operacao',
    '210210': 'Ciencia da Operacao',
    '210220': 'Desconhecimento da Operacao',
    '210240': 'Operacao nao Realizada',
};

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// dhEvento exige timezone explícito (padrão AAAA-MM-DDThh:mm:ssTZD) — usa
// o horário de Brasília via Intl em vez do fuso da máquina, pra não
// depender de como o servidor está configurado. Sem horário de verão no
// Brasil desde 2019, o offset -03:00 é estável.
export function formatDhEventoBrasilia(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value || '00';

    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-03:00`;
}

// Extrai a chave privada e o certificado (em PEM) de dentro do .pfx —
// necessário porque o restante deste cliente só usa o .pfx bruto pra mTLS
// (via https.request), mas assinar XML exige acesso separado à chave
// privada e ao certificado, o que o node não expõe nativamente a partir
// de um PKCS#12. Quando o .pfx tem mais de um certificado (ex: cadeia
// intermediária junto), escolhe o que combina com a chave privada (mesmo
// módulo RSA) em vez de assumir que é sempre o primeiro.
export function extractKeyAndCertPem(cert: LoadedCertificate): {
    privateKeyPem: string;
    certPem: string;
} {
    const p12Der = cert.pfx.toString('binary');
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, cert.passphrase);

    const keyBagsShrouded = p12.getBags({
        bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    })[forge.pki.oids.pkcs8ShroudedKeyBag];
    const keyBagsPlain = p12.getBags({ bagType: forge.pki.oids.keyBag })[
        forge.pki.oids.keyBag
    ];

    const keyBag = (keyBagsShrouded && keyBagsShrouded[0]) || (keyBagsPlain && keyBagsPlain[0]);

    if (!keyBag || !keyBag.key) {
        throw new Error('Não foi possível extrair a chave privada do certificado (.pfx).');
    }

    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
        forge.pki.oids.certBag
    ];

    if (!certBags || certBags.length === 0) {
        throw new Error('Não foi possível extrair o certificado (.pfx).');
    }

    const matching = certBags.find((bag) => {
        const publicKey = bag.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
        return publicKey && publicKey.n.equals(privateKey.n);
    });

    const certificate = (matching?.cert || certBags[0].cert) as forge.pki.Certificate;

    return {
        privateKeyPem: forge.pki.privateKeyToPem(privateKey),
        certPem: forge.pki.certificateToPem(certificate),
    };
}

export type ManifestacaoResult = {
    success: boolean;
    cStat?: string;
    xMotivo?: string;
    message: string;
};

// Monta, assina (XML-DSig, RSA-SHA1 + C14N — padrão exigido pela Sefaz pra
// eventos de NF-e) e envia o evento de manifestação do destinatário.
// tpEvento padrão é 210210 (Ciência da Operação): não afirma que a
// mercadoria foi recebida, só que a loja está ciente da nota — é o evento
// certo pra automatizar, já que não compromete a empresa com uma
// confirmação que só uma pessoa deveria dar.
export async function sendManifestacao(
    cert: LoadedCertificate,
    params: {
        uf: string;
        cnpj: string;
        chaveAcesso: string;
        tpEvento?: string;
        nSeqEvento?: number;
        xJust?: string;
        tpAmb?: 1 | 2;
    },
): Promise<ManifestacaoResult> {
    const tpEvento = params.tpEvento || '210210';
    const nSeqEvento = params.nSeqEvento || 1;
    const tpAmb = params.tpAmb || 1;
    const cnpjDigits = params.cnpj.replace(/\D/g, '');
    const cUF = ufToCode(params.uf);

    const idEvento = `ID${tpEvento}${params.chaveAcesso}${String(nSeqEvento).padStart(2, '0')}`;
    const descEvento = TP_EVENTO_DESCRICAO[tpEvento] || 'Evento';
    const xJustBlock =
        tpEvento === '210240' && params.xJust
            ? `<xJust>${escapeXml(params.xJust)}</xJust>`
            : '';

    const infEventoXml =
        `<infEvento Id="${idEvento}">` +
        `<cOrgao>${cUF}</cOrgao>` +
        `<tpAmb>${tpAmb}</tpAmb>` +
        `<CNPJ>${cnpjDigits}</CNPJ>` +
        `<chNFe>${params.chaveAcesso}</chNFe>` +
        `<dhEvento>${formatDhEventoBrasilia(new Date())}</dhEvento>` +
        `<tpEvento>${tpEvento}</tpEvento>` +
        `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
        `<verEvento>1.00</verEvento>` +
        `<detEvento versao="1.00"><descEvento>${descEvento}</descEvento>${xJustBlock}</detEvento>` +
        `</infEvento>`;

    const eventoXml = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${infEventoXml}</evento>`;

    let signedEvento: string;

    try {
        const { privateKeyPem, certPem } = extractKeyAndCertPem(cert);

        const sig = new SignedXml({
            privateKey: privateKeyPem,
            publicCert: certPem,
            signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
            canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        });

        sig.addReference({
            xpath: "//*[local-name(.)='infEvento']",
            transforms: [
                'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
                'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
            ],
            digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
        });

        sig.computeSignature(eventoXml, {
            location: {
                reference: "//*[local-name(.)='infEvento']",
                action: 'after',
            },
        });

        signedEvento = sig.getSignedXml();
    } catch (error: any) {
        return {
            success: false,
            message: `Erro ao assinar o evento de manifestação: ${error?.message || error}`,
        };
    }

    const idLote = String(Date.now()).slice(-15);
    const envEventoXml = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${idLote}</idLote>${signedEvento}</envEvento>`;

    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>${envEventoXml}</nfeDadosMsg>
    </nfeRecepcaoEvento>
  </soap12:Body>
</soap12:Envelope>`;

    const url = getRecepcaoEventoUrl(params.uf);

    let response: RawResponse;

    try {
        response = await soapPost(url, soapEnvelope, cert, RECEPCAO_EVENTO_ACTION);
    } catch (error: any) {
        return {
            success: false,
            message: `Erro de conexão com a Sefaz (${url}): ${error?.message || error}`,
        };
    }

    let parsed: any;

    try {
        parsed = parser.parse(response.body);
    } catch {
        return {
            success: false,
            message: `Resposta da Sefaz não é um XML válido (HTTP ${response.status}): ${truncate(response.body)}`,
        };
    }

    // Procura primeiro o cStat/xMotivo do evento em si (dentro de
    // infEvento na resposta) — só cai pro nível do lote (retEnvEvento) se
    // o evento nem chegou a ser processado individualmente.
    const infEventoResp = findNode(parsed, 'infEvento');
    const cStat = extractText(infEventoResp?.cStat) || extractText(findNode(parsed, 'cStat'));
    const xMotivo =
        extractText(infEventoResp?.xMotivo) || extractText(findNode(parsed, 'xMotivo'));

    // 135 = evento registrado e vinculado à NF-e; 136 = registrado mas a
    // Sefaz ainda não tem essa NF-e no banco dela (raro, mas não é erro
    // nosso). Qualquer outro código é rejeição.
    const success = cStat === '135' || cStat === '136';

    // Se mesmo com o fallback de reparse (ver findNode) o cStat continuar
    // vazio, algo na resposta tem um formato que a gente ainda não
    // previu — loga o corpo bruto pra dar pra diagnosticar direto pelos
    // logs do servidor em vez de só ver "motivo desconhecido" na tela.
    if (!cStat) {
        console.error(
            `[sendManifestacao] cStat vazio na resposta da Sefaz (chave ${params.chaveAcesso}). Corpo bruto: ${truncate(response.body, 3000)}`,
        );
    }

    return {
        success,
        cStat,
        xMotivo,
        message: success
            ? `Ciência da operação registrada (${cStat} - ${xMotivo}).`
            : `Sefaz rejeitou a manifestação (${cStat || '?'} - ${xMotivo || 'motivo desconhecido'}).`,
    };
}

// ---------------------------------------------------------------------
// Autorização de NF-e (envio + consulta de recibo)
//
// Diferente de tudo mais neste arquivo (que só lê dados da Sefaz), isso
// aqui EMITE de verdade — envia um XML já assinado (montado por
// loss-nfe-builder.ts ou devolucao-nfe-builder.ts) pro webservice de
// autorização e, se aceito, a NF-e passa a ter valor fiscal real (no
// ambiente que foi enviada, produção ou homologação). Use com cuidado:
// isso não é mais só leitura.
//
// Endereços tirados do portal oficial da SVRS
// (https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos), que lista o
// autorizador de cada UF (nem toda UF autoriza a própria NF-e — várias
// usam a SVRS ou a SVAN como autorizador delegado; a tabela abaixo só
// lista quem tem autorizador próprio, com fallback pra SVRS igual já era
// feito pro webservice de eventos).
const NFE_AUTORIZACAO_URLS: Record<string, { producao: string; homologacao: string }> = {
    AM: {
        producao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
        homologacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
    },
    BA: {
        producao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
        homologacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
    },
    GO: {
        producao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
        homologacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
    },
    MG: {
        producao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
        homologacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
    },
    MS: {
        producao: 'https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
        homologacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
    },
    MT: {
        producao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
        homologacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
    },
    PE: {
        producao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
        homologacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
    },
    PR: {
        producao: 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4',
        homologacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4',
    },
    RS: {
        producao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
        homologacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
    },
    SP: {
        producao: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
        homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
    },
};

const NFE_AUTORIZACAO_SVRS_FALLBACK = {
    producao: 'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
    homologacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
};

const NFE_RET_AUTORIZACAO_URLS: Record<string, { producao: string; homologacao: string }> = {
    AM: {
        producao: 'https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
        homologacao: 'https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4',
    },
    BA: {
        producao: 'https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
        homologacao: 'https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx',
    },
    GO: {
        producao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
        homologacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4',
    },
    MG: {
        producao: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
        homologacao: 'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4',
    },
    MS: {
        producao: 'https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
        homologacao: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4',
    },
    MT: {
        producao: 'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4',
        homologacao: 'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4',
    },
    PE: {
        producao: 'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4',
        homologacao: 'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4',
    },
    PR: {
        producao: 'https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4',
        homologacao: 'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4',
    },
    RS: {
        producao: 'https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
        homologacao: 'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
    },
    SP: {
        producao: 'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
        homologacao: 'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
    },
};

const NFE_RET_AUTORIZACAO_SVRS_FALLBACK = {
    producao: 'https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
    homologacao: 'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
};

function getAutorizacaoUrl(uf: string, tpAmb: 1 | 2): string {
    const entry = NFE_AUTORIZACAO_URLS[uf.trim().toUpperCase()] || NFE_AUTORIZACAO_SVRS_FALLBACK;
    return tpAmb === 2 ? entry.homologacao : entry.producao;
}

function getRetAutorizacaoUrl(uf: string, tpAmb: 1 | 2): string {
    const entry = NFE_RET_AUTORIZACAO_URLS[uf.trim().toUpperCase()] || NFE_RET_AUTORIZACAO_SVRS_FALLBACK;
    return tpAmb === 2 ? entry.homologacao : entry.producao;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AutorizacaoResult = {
    // 'autorizada' = cStat 100 (uso autorizado); 'rejeitada' = qualquer
    // outro cStat definitivo; 'pendente' = a Sefaz aceitou o lote mas
    // ainda não processou depois de todas as tentativas de consulta —
    // precisa checar de novo mais tarde com o nRec salvo.
    status: 'autorizada' | 'rejeitada' | 'pendente';
    cStat?: string;
    xMotivo?: string;
    protocolo?: string; // nProt, só quando autorizada
    nRec?: string; // recibo do lote, só quando ficou pendente
    message: string;
};

// Monta o envelope enviNFe (lote de 1 NF-e, processamento síncrono —
// indSinc=1) e envia pro webservice de autorização da UF autorizadora da
// loja. A NF-e já vem pronta e assinada (parâmetro nfeXmlAssinado), como
// devolvida por buildAndSignLossNfe/buildAndSignDevolucaoNfe.
export async function sendAutorizacaoNfe(
    cert: LoadedCertificate,
    params: {
        uf: string;
        tpAmb: 1 | 2;
        nfeXmlAssinado: string; // já inclui a tag <NFe>...</NFe> com a assinatura
    },
): Promise<AutorizacaoResult> {
    const idLote = String(Date.now()).slice(-15);

    const enviNFeXml =
        `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
        `<idLote>${idLote}</idLote>` +
        `<indSinc>1</indSinc>` +
        params.nfeXmlAssinado.replace(/^<\?xml[^>]*\?>/, '') +
        `</enviNFe>`;

    // Sem elemento "nfeAutorizacaoLote" envolvendo — o dispatch de vários
    // webservices estaduais (implementação Java/CXF, ex: MG, GO, MT, MS,
    // PE, AM) é feito só pela SOAPAction, e eles esperam o nfeDadosMsg
    // direto como filho do Body (igual bibliotecas de referência tipo
    // sped-nfe fazem). Um wrapper extra faz alguns desses servidores
    // devolverem "Não é possível localizar o método de despacho".
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${enviNFeXml}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const url = getAutorizacaoUrl(params.uf, params.tpAmb);
    const action = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote';

    let response: RawResponse;

    try {
        response = await soapPost(url, soapEnvelope, cert, action);
    } catch (error: any) {
        return {
            status: 'rejeitada',
            message: `Erro de conexão com a Sefaz (${url}): ${error?.message || error}`,
        };
    }

    let parsed: any;

    try {
        parsed = parser.parse(response.body);
    } catch {
        return {
            status: 'rejeitada',
            message: `Resposta da Sefaz não é um XML válido (HTTP ${response.status}): ${truncate(response.body, 3000)}`,
        };
    }

    const result = interpretAutorizacaoResponse(parsed);

    if (result.status !== 'pendente' || !result.nRec) {
        if (!result.cStat) {
            // Não achamos cStat em lugar nenhum — normalmente é um SOAP
            // Fault ou resposta em formato inesperado, não uma rejeição
            // fiscal de verdade. Bota o corpo bruto (resumido) direto na
            // mensagem, porque o usuário não tem acesso ao console do
            // servidor pra ver o log.
            console.error(
                `[sendAutorizacaoNfe] cStat vazio na resposta da Sefaz (${url}). Corpo bruto: ${truncate(response.body, 3000)}`,
            );

            return {
                ...result,
                message: buildUnrecognizedResponseMessage(response),
            };
        }

        return result;
    }

    // Lote aceito mas ainda em processamento (cStat 103/105 com nRec) —
    // consulta o recibo algumas vezes com espera crescente antes de
    // desistir e devolver "pendente" (quem chamou pode tentar de novo
    // depois usando consultarReciboNfe com o nRec salvo).
    const nRec = result.nRec;
    const waitsMs = [3000, 5000, 8000];

    for (const waitMs of waitsMs) {
        await sleep(waitMs);

        const retry = await consultarReciboNfe(cert, {
            uf: params.uf,
            tpAmb: params.tpAmb,
            nRec,
        });

        if (retry.status !== 'pendente') {
            return retry;
        }
    }

    return {
        status: 'pendente',
        cStat: result.cStat,
        xMotivo: result.xMotivo,
        nRec,
        message: `Lote recebido pela Sefaz (recibo ${nRec}), ainda em processamento depois de algumas tentativas — consulte de novo em alguns minutos.`,
    };
}

// Consulta um recibo de lote já enviado (NFeRetAutorizacao4) — usado
// internamente pelo retry de sendAutorizacaoNfe, e também exportado pra
// dar pra checar de novo manualmente um lote que ficou "pendente".
export async function consultarReciboNfe(
    cert: LoadedCertificate,
    params: { uf: string; tpAmb: 1 | 2; nRec: string },
): Promise<AutorizacaoResult> {
    const consReciNFeXml =
        `<consReciNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
        `<tpAmb>${params.tpAmb}</tpAmb>` +
        `<nRec>${escapeXml(params.nRec)}</nRec>` +
        `</consReciNFe>`;

    // Mesmo motivo do sendAutorizacaoNfe: sem wrapper de operação, só o
    // nfeDadosMsg direto como filho do Body.
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4">${consReciNFeXml}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;

    const url = getRetAutorizacaoUrl(params.uf, params.tpAmb);
    const action = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4/nfeRetAutorizacaoLote';

    let response: RawResponse;

    try {
        response = await soapPost(url, soapEnvelope, cert, action);
    } catch (error: any) {
        return {
            status: 'rejeitada',
            message: `Erro de conexão com a Sefaz (${url}): ${error?.message || error}`,
        };
    }

    let parsed: any;

    try {
        parsed = parser.parse(response.body);
    } catch {
        return {
            status: 'rejeitada',
            message: `Resposta da Sefaz não é um XML válido (HTTP ${response.status}): ${truncate(response.body, 3000)}`,
        };
    }

    const result = interpretAutorizacaoResponse(parsed);

    if (!result.cStat) {
        console.error(
            `[consultarReciboNfe] cStat vazio na resposta da Sefaz (${url}). Corpo bruto: ${truncate(response.body, 3000)}`,
        );

        return {
            ...result,
            message: buildUnrecognizedResponseMessage(response),
        };
    }

    return result;
}

// Lê tanto retEnviNFe (resposta direta do envio) quanto retConsReciNFe
// (resposta da consulta de recibo) — as duas têm o mesmo formato de
// protNFe/infProt quando processadas, então um único interpretador serve
// pras duas.
function interpretAutorizacaoResponse(parsed: any): AutorizacaoResult {
    const protNFe = findNode(parsed, 'protNFe');
    const infProt = protNFe ? findNode(protNFe, 'infProt') : findNode(parsed, 'infProt');

    if (infProt) {
        const cStat = extractText(infProt.cStat);
        const xMotivo = extractText(infProt.xMotivo);
        const nProt = extractText(infProt.nProt);

        if (cStat === '100') {
            return {
                status: 'autorizada',
                cStat,
                xMotivo,
                protocolo: nProt || undefined,
                message: `NF-e autorizada pela Sefaz (protocolo ${nProt}).`,
            };
        }

        return {
            status: 'rejeitada',
            cStat,
            xMotivo,
            message: `Sefaz rejeitou a NF-e (${cStat || '?'} - ${xMotivo || 'motivo desconhecido'}).`,
        };
    }

    // Sem protNFe — olha o cStat do lote em si (nível retEnviNFe/
    // retConsReciNFe). 103/105 = ainda processando (precisa consultar o
    // recibo, se veio). Qualquer outro código sem protNFe é rejeição do
    // lote inteiro (ex: 215 duplicidade, 225 falha de schema etc.).
    const loteCStat = extractText(findNode(parsed, 'cStat'));
    const loteXMotivo = extractText(findNode(parsed, 'xMotivo'));
    const infRec = findNode(parsed, 'infRec');
    const nRec = infRec ? extractText(infRec.nRec) : '';

    if ((loteCStat === '103' || loteCStat === '105') && nRec) {
        return {
            status: 'pendente',
            cStat: loteCStat,
            xMotivo: loteXMotivo,
            nRec,
            message: `Lote recebido pela Sefaz (recibo ${nRec}), ainda em processamento.`,
        };
    }

    return {
        status: 'rejeitada',
        cStat: loteCStat,
        xMotivo: loteXMotivo,
        message: loteCStat
            ? `Sefaz recusou o lote: ${loteCStat} - ${loteXMotivo || 'motivo desconhecido'}.`
            : `Resposta da Sefaz sem cStat reconhecível.`,
    };
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

export type ParsedFullNfe = {
    chaveAcesso: string;
    tipoDocumento?: string; // mod do XML: 55 = NF-e, 65 = NFC-e
    issuerCnpj?: string;
    issuerName?: string;
    recipientCnpj?: string;
    recipientName?: string;
    value?: number;
    issueDate?: string;
    situacao?: string;
};

// Acha o primeiro nó com esse nome em qualquer profundidade — usado aqui
// porque o XML completo de uma NF-e pode vir "cru" (<NFe>...</NFe>) ou
// embrulhado no protocolo de autorização (<nfeProc><NFe>...<protNFe>...),
// dependendo de onde a pessoa exportou o arquivo.
// Mesmo problema documentado em findRetDistDFeInt: alguns webservices
// .asmx (incluindo o de recepção de evento/manifestação, não só o de
// distribuição) devolvem o corpo da resposta como texto com entidades já
// desescapadas dentro de um nó "#text", em vez de XML aninhado de
// verdade. Sem esse fallback, findNode nunca enxergava infEvento/cStat
// dentro da resposta da manifestação — a busca simplesmente não descia
// pra dentro da string — e cStat/xMotivo voltavam sempre vazios,
// aparecendo na tela como "Sefaz rejeitou a manifestação (? - motivo
// desconhecido)" mesmo quando a manifestação tinha sido aceita (ou
// rejeitada por um motivo real, que nunca chegava a ser lido).
function findNode(parsed: any, key: string): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;
        if (node[key] !== undefined) return node[key];

        for (const nodeKey of Object.keys(node)) {
            const value = node[nodeKey];

            // Algumas respostas SOAP da Sefaz (várias .asmx, não só
            // distribuição/manifestação) devolvem o XML de resultado como
            // texto escapado em vez de nó já interpretado. Isso pode vir
            // tanto como um nó '#text' (quando o elemento tem atributos)
            // quanto como o valor direto de qualquer chave (elemento só
            // com texto, sem atributos) — então checa os dois casos, não
            // só '#text'.
            if (typeof value === 'string' && /^\s*<\w/.test(value)) {
                try {
                    const reparsed = parser.parse(value);
                    if (reparsed && typeof reparsed === 'object') {
                        stack.push(reparsed);
                    }
                } catch {
                    // não era XML de verdade — ignora e segue a busca
                }

                continue;
            }

            if (value && typeof value === 'object') stack.push(value);
        }
    }

    return null;
}

// Diferente de parseResNFe (que só entende o "resumo" resNFe devolvido pela
// distribuição automática da Sefaz), essa função lê o XML completo da NF-e
// — o mesmo tipo de arquivo que dá pra baixar direto do sistema do
// fornecedor ou do PDV de vendas. É o que alimenta a importação manual em
// massa (Entrada e Saída), já que nem toda NF passa pela distribuição
// automática.
export function parseFullNfeXml(xml: string): ParsedFullNfe | null {
    let parsed: any;

    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const infNFe = findNode(parsed, 'infNFe');

    if (!infNFe) return null;

    const idAttr = extractText(infNFe['@_Id']) || String(infNFe['@_Id'] || '');
    const chaveFromId = idAttr.replace(/^NFe/i, '').replace(/\D/g, '');

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const total = infNFe.total?.ICMSTot || {};

    const chNFeExplicit = extractText(ide.chNFe) || extractText(infNFe.chNFe);
    const chaveAcesso = chaveFromId.length === 44 ? chaveFromId : chNFeExplicit;

    if (!chaveAcesso || chaveAcesso.length !== 44) return null;

    // O protocolo de autorização (cStat/xMotivo) só existe se o arquivo
    // exportado incluiu o nfeProc inteiro — se vier só a <NFe> "crua", fica
    // sem situação conhecida (assumimos que é válida, já que foi emitida).
    const infProt = findNode(parsed, 'infProt');
    const cStat = infProt ? extractText(infProt.cStat) : '';
    const xMotivo = infProt ? extractText(infProt.xMotivo) : '';

    return {
        chaveAcesso,
        tipoDocumento: extractText(ide.mod) || undefined,
        issuerCnpj: extractText(emit.CNPJ) || undefined,
        issuerName: extractText(emit.xNome) || undefined,
        recipientCnpj: extractText(dest.CNPJ) || undefined,
        recipientName: extractText(dest.xNome) || undefined,
        value: total.vNF != null ? Number(extractText(total.vNF)) : undefined,
        issueDate: extractText(ide.dhEmi) || extractText(ide.dEmi) || undefined,
        situacao: cStat
            ? cStat === '100'
                ? 'Autorizada'
                : `${cStat} - ${xMotivo}`
            : undefined,
    };
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
    if (value == null) return [];
    return Array.isArray(value) ? value : [value];
}

type NfeAddress = {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    // Código IBGE do município (cMun) — não aparece na tela de
    // visualização, mas é exigido pra montar o enderDest de uma futura
    // NF-e de devolução referenciando esse emitente (ver devolucoes/).
    codigoMunicipioIbge?: string;
    uf?: string;
    cep?: string;
};

function extractAddress(ender: any): NfeAddress | undefined {
    if (!ender) return undefined;

    return {
        logradouro: extractText(ender.xLgr) || undefined,
        numero: extractText(ender.nro) || undefined,
        complemento: extractText(ender.xCpl) || undefined,
        bairro: extractText(ender.xBairro) || undefined,
        municipio: extractText(ender.xMun) || undefined,
        codigoMunicipioIbge: extractText(ender.cMun) || undefined,
        uf: extractText(ender.UF) || undefined,
        cep: extractText(ender.CEP) || undefined,
    };
}

export type NfeViewItem = {
    numero?: string;
    descricao?: string;
    ncm?: string;
    cfop?: string;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    valorTotal?: number;
};

export type NfeView = {
    chaveAcesso: string;
    tipoDocumento?: string;
    naturezaOperacao?: string;
    issueDate?: string;
    situacao?: string;
    emitente: {
        nome?: string;
        cnpj?: string;
        // Não exibido na tela de visualização — usado pra montar o
        // enderDest/IE de uma futura NF-e de devolução, que devolve a
        // mercadoria pra esse mesmo emitente (ver devolucoes/).
        inscricaoEstadual?: string;
        endereco?: NfeAddress;
    };
    destinatario: {
        nome?: string;
        cnpj?: string;
        cpf?: string;
        endereco?: NfeAddress;
    };
    itens: NfeViewItem[];
    totais: {
        valorProdutos?: number;
        valorDesconto?: number;
        valorFrete?: number;
        valorSeguro?: number;
        valorOutrasDespesas?: number;
        valorTotal?: number;
        valorICMS?: number;
        valorIPI?: number;
        valorPIS?: number;
        valorCOFINS?: number;
    };
    // Quando o XML disponível é só o resumo (resNFe), não tem itens nem
    // impostos detalhados — sinaliza pro front mostrar um aviso em vez de
    // uma tabela vazia.
    detalhamentoCompleto: boolean;
};

// Extrai bem mais detalhe que parseFullNfeXml (itens, endereços, impostos)
// — usado só pra tela de visualização legível da NF, não pro fluxo de
// conciliação em si.
export function parseFullNfeForView(xml: string): NfeView | null {
    let parsed: any;

    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const infNFe = findNode(parsed, 'infNFe');

    if (!infNFe) return null;

    const idAttr = extractText(infNFe['@_Id']) || String(infNFe['@_Id'] || '');
    const chaveFromId = idAttr.replace(/^NFe/i, '').replace(/\D/g, '');

    const ide = infNFe.ide || {};
    const emit = infNFe.emit || {};
    const dest = infNFe.dest || {};
    const total = infNFe.total?.ICMSTot || {};

    const chNFeExplicit = extractText(ide.chNFe) || extractText(infNFe.chNFe);
    const chaveAcesso = chaveFromId.length === 44 ? chaveFromId : chNFeExplicit;

    if (!chaveAcesso || chaveAcesso.length !== 44) return null;

    const infProt = findNode(parsed, 'infProt');
    const cStat = infProt ? extractText(infProt.cStat) : '';
    const xMotivo = infProt ? extractText(infProt.xMotivo) : '';

    const itens: NfeViewItem[] = toArray(infNFe.det).map((det: any) => {
        const prod = det?.prod || {};

        return {
            numero: extractText(det?.['@_nItem']) || undefined,
            descricao: extractText(prod.xProd) || undefined,
            ncm: extractText(prod.NCM) || undefined,
            cfop: extractText(prod.CFOP) || undefined,
            quantidade: prod.qCom != null ? Number(extractText(prod.qCom)) : undefined,
            unidade: extractText(prod.uCom) || undefined,
            valorUnitario:
                prod.vUnCom != null ? Number(extractText(prod.vUnCom)) : undefined,
            valorTotal: prod.vProd != null ? Number(extractText(prod.vProd)) : undefined,
        };
    });

    return {
        chaveAcesso,
        tipoDocumento: extractText(ide.mod) || undefined,
        naturezaOperacao: extractText(ide.natOp) || undefined,
        issueDate: extractText(ide.dhEmi) || extractText(ide.dEmi) || undefined,
        situacao: cStat
            ? cStat === '100'
                ? 'Autorizada'
                : `${cStat} - ${xMotivo}`
            : undefined,
        emitente: {
            nome: extractText(emit.xNome) || undefined,
            cnpj: extractText(emit.CNPJ) || undefined,
            inscricaoEstadual: extractText(emit.IE) || undefined,
            endereco: extractAddress(emit.enderEmit),
        },
        destinatario: {
            nome: extractText(dest.xNome) || undefined,
            cnpj: extractText(dest.CNPJ) || undefined,
            cpf: extractText(dest.CPF) || undefined,
            endereco: extractAddress(dest.enderDest),
        },
        itens,
        totais: {
            valorProdutos:
                total.vProd != null ? Number(extractText(total.vProd)) : undefined,
            valorDesconto:
                total.vDesc != null ? Number(extractText(total.vDesc)) : undefined,
            valorFrete:
                total.vFrete != null ? Number(extractText(total.vFrete)) : undefined,
            valorSeguro:
                total.vSeg != null ? Number(extractText(total.vSeg)) : undefined,
            valorOutrasDespesas:
                total.vOutro != null ? Number(extractText(total.vOutro)) : undefined,
            valorTotal: total.vNF != null ? Number(extractText(total.vNF)) : undefined,
            valorICMS: total.vICMS != null ? Number(extractText(total.vICMS)) : undefined,
            valorIPI: total.vIPI != null ? Number(extractText(total.vIPI)) : undefined,
            valorPIS: total.vPIS != null ? Number(extractText(total.vPIS)) : undefined,
            valorCOFINS:
                total.vCOFINS != null ? Number(extractText(total.vCOFINS)) : undefined,
        },
        detalhamentoCompleto: itens.length > 0,
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

// Quando a Sefaz devolve um SOAP Fault (erro de comunicação/dispatch, não
// uma rejeição fiscal — ex: método de despacho não encontrado, XML mal
// formado, action errada), a mensagem legível fica dentro de <S:Text>/
// <faultstring>. Extrai só esse texto pra mostrar algo apresentável em vez
// do XML cru inteiro na tela do usuário.
function extractSoapFaultReason(body: string): string | null {
    const textMatch = body.match(/<[^:>]*:?Text[^>]*>([\s\S]*?)<\/[^:>]*:?Text>/i);
    if (textMatch) return textMatch[1].trim();

    const faultstringMatch = body.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
    if (faultstringMatch) return faultstringMatch[1].trim();

    return null;
}

// Monta uma mensagem apresentável pra quando a resposta da Sefaz não tem
// cStat em lugar nenhum — geralmente é um erro técnico de comunicação
// (SOAP Fault, URL/ação errada), não uma rejeição fiscal de verdade. Deixa
// o XML cru só como detalhe técnico opcional, resumido.
function buildUnrecognizedResponseMessage(response: RawResponse): string {
    const faultReason = extractSoapFaultReason(response.body);

    if (faultReason) {
        return `Erro de comunicação com a Sefaz (não é uma rejeição fiscal): ${faultReason}`;
    }

    return `Resposta da Sefaz em formato não reconhecido (HTTP ${response.status}). Detalhe técnico: ${truncate(response.body, 800)}`;
}
