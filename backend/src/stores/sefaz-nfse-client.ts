import { request } from 'https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { XMLParser } from 'fast-xml-parser';

import { decryptSecret, type EncryptedSecret } from './certificate-crypto.util';

// Só a especificação da API (não é dado sensível), salva pra eu conseguir
// ler o contrato completo sem depender de copiar/colar um JSON gigante.
const diagnosticsPath = join(process.cwd(), 'storage', 'diagnostics');

if (!existsSync(diagnosticsPath)) {
    mkdirSync(diagnosticsPath, { recursive: true });
}

// A API de produção do ADN (NFS-e nacional) só foi liberada em 01/10/2025 —
// antes disso só existia o ambiente de homologação (chamado de "produção
// restrita" pela Sefaz), e é o que ficou fixo aqui por um tempo. Confirmado
// em gov.br/nfse (biblioteca > documentação técnica > APIs - Prod. Restrita
// e Produção) que o endereço de produção é o abaixo.
const PRODUCAO_BASE_URL = 'https://adn.nfse.gov.br';
const HOMOLOGACAO_BASE_URL =
    'https://adn.producaorestrita.nfse.gov.br';

export type Ambiente = 'PRODUCAO' | 'HOMOLOGACAO';

function baseUrlFor(ambiente: Ambiente = 'PRODUCAO'): string {
    return ambiente === 'HOMOLOGACAO' ? HOMOLOGACAO_BASE_URL : PRODUCAO_BASE_URL;
}

export type ConnectionTestResult = {
    success: boolean;
    message: string;
    httpStatus?: number;
    detail?: string;
};

type RawResponse = {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
};

export type LoadedCertificate = {
    pfx: Buffer;
    passphrase: string;
};

export function loadCertificate(
    pfxPath: string,
    encryptedPassword: EncryptedSecret,
): LoadedCertificate {
    const pfx = readFileSync(pfxPath);
    const passphrase = decryptSecret(encryptedPassword);
    return { pfx, passphrase };
}

// Faz um GET autenticado por mTLS (certificado cliente) e devolve o status +
// corpo cru. Não usa nenhuma lib de HTTP externa — só o módulo https nativo.
function mtlsGet(
    url: string,
    cert: LoadedCertificate,
): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
        let req: ReturnType<typeof request>;

        try {
            req = request(
                url,
                {
                    method: 'GET',
                    pfx: cert.pfx,
                    passphrase: cert.passphrase,
                    timeout: 15000,
                    headers: {
                        Accept: 'application/json, text/html, */*',
                    },
                },
                (res) => {
                    const chunks: Buffer[] = [];

                    res.on('data', (chunk) => chunks.push(chunk));

                    res.on('end', () => {
                        resolve({
                            status: res.statusCode || 0,
                            headers: res.headers as Record<
                                string,
                                string | string[] | undefined
                            >,
                            body: Buffer.concat(chunks).toString(
                                'utf-8',
                            ),
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

        req.end();
    });
}

// Confirma que o certificado autentica e a Sefaz/ADN responde. Não baixa
// nem grava nada de verdade — mas ainda assim consulta um NSU real, então
// SEMPRE recebe o cursor já salvo do certificado (nunca fixo em 0). Repetir
// NSU=0 a cada clique é exatamente o padrão "consulta fora de sequência"
// que a Sefaz pune com bloqueio de 1h por "consumo indevido" — ainda mais
// arriscado agora que outro sistema (contabilidade/Omie) também consulta
// esse mesmo CNPJ.
export async function testCertificateConnection(
    pfxPath: string,
    encryptedPassword: EncryptedSecret,
    ambiente: Ambiente = 'PRODUCAO',
    nsu: number | bigint = 0,
): Promise<ConnectionTestResult> {
    let pfx: Buffer;

    try {
        pfx = readFileSync(pfxPath);
    } catch {
        return {
            success: false,
            message:
                'Arquivo do certificado não foi encontrado no servidor. Cadastre o certificado novamente.',
        };
    }

    let passphrase: string;

    try {
        passphrase = decryptSecret(encryptedPassword);
    } catch {
        return {
            success: false,
            message:
                'Não foi possível descriptografar a senha salva. Cadastre o certificado novamente.',
        };
    }

    const cert: LoadedCertificate = { pfx, passphrase };

    try {
        const response = await mtlsGet(
            `${baseUrlFor(ambiente)}/contribuintes/DFe/${nsu}`,
            cert,
        );

        return interpretResponse(response.status, response.body);
    } catch (error) {
        return interpretConnectionError(error);
    }
}

// Tipos alinhados ao swagger real da API (LoteDistribuicaoNSUResponse),
// obtido em .../contribuintes/swagger/v1/swagger.json com o certificado já
// funcionando. TipoDocumento pode ser NENHUM | DPS | PEDIDO_REGISTRO_EVENTO
// | NFSE | EVENTO | CNC.
export type DistribuicaoNSU = {
    NSU: number;
    ChaveAcesso?: string | null;
    TipoDocumento: string;
    TipoEvento?: string | null;
    ArquivoXml?: string | null;
    DataHoraGeracao?: string | null;
};

export type MensagemProcessamento = {
    Codigo?: string | null;
    Descricao?: string | null;
    Complemento?: string | null;
};

export type LoteDistribuicaoNSUResponse = {
    StatusProcessamento:
    | 'REJEICAO'
    | 'NENHUM_DOCUMENTO_LOCALIZADO'
    | 'DOCUMENTOS_LOCALIZADOS';
    LoteDFe?: DistribuicaoNSU[] | null;
    Alertas?: MensagemProcessamento[] | null;
    Erros?: MensagemProcessamento[] | null;
    TipoAmbiente: 'PRODUCAO' | 'HOMOLOGACAO';
    VersaoAplicativo?: string | null;
    DataHoraProcessamento: string;
};

// Busca um "lote" de documentos a partir de um NSU. success=false com body
// vazio (404 sem StatusProcessamento) normalmente indica caminho errado;
// aqui já assumimos o caminho correto (/contribuintes/DFe/{NSU}).
export async function fetchDistribution(
    cert: LoadedCertificate,
    nsu: number | bigint,
    ambiente: Ambiente = 'PRODUCAO',
): Promise<LoteDistribuicaoNSUResponse> {
    const response = await mtlsGet(
        `${baseUrlFor(ambiente)}/contribuintes/DFe/${nsu}?lote=true`,
        cert,
    );

    let parsed: LoteDistribuicaoNSUResponse | undefined;

    try {
        parsed = JSON.parse(response.body);
    } catch {
        // segue undefined, tratado abaixo
    }

    if (!parsed || !parsed.StatusProcessamento) {
        throw new Error(
            `Resposta inesperada da Sefaz (HTTP ${response.status}): ${truncate(
                response.body,
                300,
            )}`,
        );
    }

    if (parsed.StatusProcessamento === 'REJEICAO') {
        const motivos = (parsed.Erros || [])
            .map((erro) => erro.Descricao)
            .filter(Boolean)
            .join('; ');

        throw new Error(
            `Sefaz rejeitou a consulta${motivos ? `: ${motivos}` : '.'}`,
        );
    }

    return parsed;
}

// O ArquivoXml vem comprimido em GZip e codificado em base64 (padrão
// documentado pela própria API). Se por algum motivo não vier comprimido,
// caímos pro texto puro em vez de derrubar o processamento do lote inteiro.
export function decodeArquivoXml(base64Content: string): string {
    const buffer = Buffer.from(base64Content, 'base64');

    try {
        return gunzipSync(buffer).toString('utf-8');
    } catch {
        return buffer.toString('utf-8');
    }
}

const nfseXmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
});

export type ParsedNfse = {
    numeroNf?: string;
    issuerName?: string;
    issuerDoc?: string;
    value?: number;
    issueDate?: string;
};

function extractText(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && '#text' in value) return String(value['#text']);
    return '';
}

// Acha o primeiro nó com esse nome em qualquer profundidade da árvore —
// necessário porque o schema do NFS-e nacional (lançado em out/2025) não
// tem documentação pública campo-a-campo, e a estrutura exata (se o valor
// vem direto em <prest>/<xNome> ou aninhado dentro de <DPS>/<infDPS>) pode
// variar. Procurar por nome em vez de caminho fixo é tolerante a isso.
function findNodeByName(parsed: any, key: string): any | null {
    const stack = [parsed];

    while (stack.length > 0) {
        const node = stack.pop();

        if (!node || typeof node !== 'object') continue;
        if (node[key] !== undefined) return node[key];

        for (const nodeKey of Object.keys(node)) {
            const value = node[nodeKey];
            if (value && typeof value === 'object') stack.push(value);
        }
    }

    return null;
}

// Extrai os dados que aparecem no card de conciliação (número, prestador,
// valor, data) do XML completo da NFS-e. Tolerante a schema — se algum
// campo não for encontrado, fica undefined em vez de derrubar a captura (a
// nota continua sendo salva, só sem aquele dado pra mostrar).
export function parseNfseXml(xml: string): ParsedNfse | null {
    let parsed: any;

    try {
        parsed = nfseXmlParser.parse(xml);
    } catch {
        return null;
    }

    // Número da nota: nDFSe (número do DFe) ou nNFSe, conforme a versão do
    // schema.
    const numeroNfRaw =
        extractText(findNodeByName(parsed, 'nDFSe')) ||
        extractText(findNodeByName(parsed, 'nNFSe'));

    // Prestador (quem prestou o serviço pra gente, o "fornecedor" desse
    // gasto). Tem dois lugares possíveis: <prest> (dentro de DPS/infDPS) e
    // <emit> (direto em infNFSe, o emissor do documento — quase sempre o
    // mesmo prestador). IMPORTANTE: <prest> às vezes vem "resumido" — só
    // CNPJ/IM/email, sem <xNome> — porque o nome completo já está no
    // <emit>. Por isso não dá pra escolher um nó inteiro e usar só ele
    // (se <prest> existir mas não tiver xNome, ia mostrar em branco); cada
    // campo busca no <prest> primeiro e cai pro <emit> independentemente.
    const prestNode = findNodeByName(parsed, 'prest');
    const emitNode = findNodeByName(parsed, 'emit');

    const issuerName =
        extractText(prestNode?.xNome) || extractText(emitNode?.xNome);
    const issuerDoc =
        extractText(prestNode?.CNPJ) ||
        extractText(prestNode?.CPF) ||
        extractText(emitNode?.CNPJ) ||
        extractText(emitNode?.CPF);

    // Valor: prioriza o valor bruto do serviço (vServ, dentro de
    // valores/vServPrest); se não achar, tenta o valor líquido (vLiq).
    const vServPrest = findNodeByName(parsed, 'vServPrest');
    const vServRaw =
        typeof vServPrest === 'object'
            ? extractText(vServPrest?.vServ)
            : extractText(vServPrest);
    const valueRaw = vServRaw || extractText(findNodeByName(parsed, 'vLiq'));

    // Data de emissão: dhEmi (data/hora de emissão da DPS) é a mais
    // confiável; dhProc (processamento no ambiente nacional) e dCompet
    // (competência) como alternativas.
    const issueDateRaw =
        extractText(findNodeByName(parsed, 'dhEmi')) ||
        extractText(findNodeByName(parsed, 'dhProc')) ||
        extractText(findNodeByName(parsed, 'dCompet'));

    return {
        numeroNf: numeroNfRaw || undefined,
        issuerName: issuerName || undefined,
        issuerDoc: issuerDoc || undefined,
        value: valueRaw ? Number(valueRaw) : undefined,
        issueDate: issueDateRaw || undefined,
    };
}

// Igual a findNodeByName, mas começa a busca a partir de um nó específico
// em vez da árvore inteira — necessário pra pegar o endereço/e-mail/etc. de
// UMA parte (prestador OU tomador) sem arriscar pegar o valor da outra
// parte (já que os dois têm campos com o mesmo nome, tipo <email> ou
// <endNac>, em pontos diferentes do XML).
function findWithin(node: any, key: string): any | null {
    return findNodeByName(node, key);
}

type NfseAddress = {
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
};

// Endereço nacional (endNac) pode aparecer direto no nó da parte (emit) ou
// aninhado em <end><endNac> (toma) — schema não é 100% padronizado entre as
// partes, então tenta os dois formatos.
function extractNfseAddress(partyNode: any): NfseAddress | undefined {
    if (!partyNode) return undefined;

    const endNac =
        findWithin(partyNode, 'endNac') || findWithin(partyNode, 'enderNac');

    if (!endNac) return undefined;

    const address: NfseAddress = {
        logradouro: extractText(endNac.xLgr) || undefined,
        numero: extractText(endNac.nro) || undefined,
        bairro: extractText(endNac.xBairro) || undefined,
        municipio: extractText(endNac.xMun) || undefined,
        uf: extractText(endNac.UF) || undefined,
        cep: extractText(endNac.CEP) || undefined,
    };

    const hasAnyField = Object.values(address).some((value) => value !== undefined);

    return hasAnyField ? address : undefined;
}

export type NfseViewParty = {
    nome?: string;
    cnpj?: string;
    cpf?: string;
    inscricaoMunicipal?: string;
    email?: string;
    endereco?: NfseAddress;
};

export type NfseView = {
    numeroNf?: string;
    issueDate?: string;
    competencia?: string;
    prestador: NfseViewParty;
    tomador: NfseViewParty;
    servico: {
        descricao?: string;
        codigoTributacaoNacional?: string;
        codigoTributacaoMunicipal?: string;
    };
    valores: {
        valorServico?: number;
        baseCalculo?: number;
        aliquota?: number;
        valorISS?: number;
        valorLiquido?: number;
        issRetido?: boolean;
    };
    // Quando não dá pra achar nem o nó de serviço nem o de valores, o XML
    // provavelmente é só um evento/resumo, não o documento completo — sinaliza
    // pro front mostrar um aviso em vez de uma tela vazia.
    detalhamentoCompleto: boolean;
};

// Extrai bem mais detalhe que parseNfseXml (tomador, endereços, descrição do
// serviço, tributos) — usado só pra tela de visualização legível da NF, não
// pro fluxo de conciliação em si.
export function parseNfseForView(xml: string): NfseView | null {
    let parsed: any;

    try {
        parsed = nfseXmlParser.parse(xml);
    } catch {
        return null;
    }

    const numeroNf =
        extractText(findNodeByName(parsed, 'nDFSe')) ||
        extractText(findNodeByName(parsed, 'nNFSe'));

    const prestNode = findNodeByName(parsed, 'prest');
    const emitNode = findNodeByName(parsed, 'emit');
    const tomaNode = findNodeByName(parsed, 'toma');

    const prestador: NfseViewParty = {
        nome: extractText(prestNode?.xNome) || extractText(emitNode?.xNome) || undefined,
        cnpj: extractText(prestNode?.CNPJ) || extractText(emitNode?.CNPJ) || undefined,
        cpf: extractText(prestNode?.CPF) || extractText(emitNode?.CPF) || undefined,
        inscricaoMunicipal:
            extractText(prestNode?.IM) || extractText(emitNode?.IM) || undefined,
        email: extractText(prestNode?.email) || extractText(emitNode?.email) || undefined,
        endereco: extractNfseAddress(emitNode) || extractNfseAddress(prestNode),
    };

    const tomador: NfseViewParty = {
        nome: extractText(tomaNode?.xNome) || undefined,
        cnpj: extractText(tomaNode?.CNPJ) || undefined,
        cpf: extractText(tomaNode?.CPF) || undefined,
        inscricaoMunicipal: extractText(tomaNode?.IM) || undefined,
        email: extractText(tomaNode?.email) || undefined,
        endereco: extractNfseAddress(tomaNode),
    };

    const cServNode = findNodeByName(parsed, 'cServ');

    const servico = {
        descricao: extractText(cServNode?.xDescServ) || undefined,
        codigoTributacaoNacional: extractText(cServNode?.cTribNac) || undefined,
        codigoTributacaoMunicipal: extractText(cServNode?.cTribMun) || undefined,
    };

    const vServPrest = findNodeByName(parsed, 'vServPrest');
    const valorServicoRaw =
        typeof vServPrest === 'object' ? extractText(vServPrest?.vServ) : extractText(vServPrest);

    const tribMunNode = findNodeByName(parsed, 'tribMun');
    const vLiqRaw = extractText(findNodeByName(parsed, 'vLiq'));
    const vBCRaw = extractText(findNodeByName(parsed, 'vBC'));
    const vISSRaw =
        extractText(tribMunNode?.vISSQN) || extractText(findNodeByName(parsed, 'vISSQN'));
    const pAliqRaw = extractText(tribMunNode?.pAliq) || extractText(findNodeByName(parsed, 'pAliq'));
    const tpRetISSQN = extractText(tribMunNode?.tpRetISSQN);

    const issueDateRaw =
        extractText(findNodeByName(parsed, 'dhEmi')) ||
        extractText(findNodeByName(parsed, 'dhProc'));
    const competenciaRaw = extractText(findNodeByName(parsed, 'dCompet'));

    const detalhamentoCompleto = Boolean(
        servico.descricao || valorServicoRaw || tomador.nome,
    );

    return {
        numeroNf: numeroNf || undefined,
        issueDate: issueDateRaw || undefined,
        competencia: competenciaRaw || undefined,
        prestador,
        tomador,
        servico,
        valores: {
            valorServico: valorServicoRaw ? Number(valorServicoRaw) : undefined,
            baseCalculo: vBCRaw ? Number(vBCRaw) : undefined,
            aliquota: pAliqRaw ? Number(pAliqRaw) : undefined,
            valorISS: vISSRaw ? Number(vISSRaw) : undefined,
            valorLiquido: vLiqRaw ? Number(vLiqRaw) : undefined,
            // 1 = retido, 2 = não retido, conforme tabela do leiaute nacional —
            // tolerante: se o schema divergir, fica undefined em vez de mentir.
            issRetido: tpRetISSQN ? tpRetISSQN === '1' : undefined,
        },
        detalhamentoCompleto,
    };
}

export type DiagnosticsResult = {
    attempts: {
        url: string;
        status?: number;
        contentType?: string;
        bodySnippet?: string;
        error?: string;
    }[];
    savedSpecFiles: string[];
};

// Usa o certificado já cadastrado (que sabemos que autentica, já que
// passamos pela etapa de TLS) pra tentar achar o endereço certo da API —
// buscando a própria página de documentação e alguns caminhos comuns de
// swagger/openapi. Só leitura, não muda nada na Sefaz.
export async function runDiagnostics(
    pfxPath: string,
    encryptedPassword: EncryptedSecret,
): Promise<DiagnosticsResult> {
    const cert = loadCertificate(pfxPath, encryptedPassword);

    const candidateUrls = [
        `${HOMOLOGACAO_BASE_URL}/contribuintes/docs/index.html`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/swagger/v1/swagger.json`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/swagger.json`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/v1/swagger.json`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/openapi.json`,
        `${HOMOLOGACAO_BASE_URL}/DFe/0`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/dfe/0`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/v1/DFe/0`,
        `${HOMOLOGACAO_BASE_URL}/contribuintes/DFe/1`,
    ];

    const savedSpecFiles: string[] = [];

    const attempts = await Promise.all(
        candidateUrls.map(async (url) => {
            try {
                const response = await mtlsGet(url, cert);

                const contentType = String(
                    response.headers['content-type'] || '',
                );

                // Especificação inteira (não truncada) salva em disco só
                // quando parece mesmo um JSON de OpenAPI/Swagger válido —
                // assim dá pra ler o contrato completo da API depois.
                const looksLikeSwaggerSpec =
                    response.status === 200 &&
                    contentType.includes('json') &&
                    response.body.includes('"openapi"');

                if (looksLikeSwaggerSpec) {
                    const fileName = `swagger-${slugifyUrl(url)}.json`;
                    const filePath = join(diagnosticsPath, fileName);

                    writeFileSync(filePath, response.body, 'utf-8');
                    savedSpecFiles.push(filePath);
                }

                return {
                    url,
                    status: response.status,
                    contentType,
                    bodySnippet: truncate(response.body, 800),
                };
            } catch (error: any) {
                return {
                    url,
                    error: String(error?.message || error),
                };
            }
        }),
    );

    return { attempts, savedSpecFiles };
}

function slugifyUrl(url: string) {
    return url
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function interpretResponse(
    status: number,
    body: string,
): ConnectionTestResult {
    if (status >= 200 && status < 300) {
        return {
            success: true,
            message:
                'Conexão feita com sucesso. O certificado autenticou normalmente na Sefaz (homologação).',
            httpStatus: status,
            detail: truncate(body),
        };
    }

    if (status === 401 || status === 403) {
        return {
            success: false,
            message:
                'A Sefaz recusou o certificado (não autorizado). Confira se o CNPJ do certificado corresponde ao CNPJ dessa loja.',
            httpStatus: status,
            detail: truncate(body),
        };
    }

    if (status === 404) {
        // A Sefaz usa 404 tanto pra "rota não existe" quanto pra "não achei
        // nenhum documento novo nesse NSU" — a segunda é uma resposta
        // válida (e esperada em homologação, sem NFs de teste ainda), não
        // um erro de verdade. Distinguimos pelo corpo da resposta.
        if (body.includes('NENHUM_DOCUMENTO_LOCALIZADO')) {
            return {
                success: true,
                message:
                    'Conexão feita com sucesso. O certificado e o endereço da API estão corretos — só não há nenhum documento novo nesse NSU ainda (normal em homologação).',
                httpStatus: status,
                detail: truncate(body),
            };
        }

        return {
            success: false,
            message:
                'Endpoint não encontrado na Sefaz. O endereço da API pode ter mudado — avise que precisamos revisar.',
            httpStatus: status,
            detail: truncate(body),
        };
    }

    if (status === 496) {
        return {
            success: false,
            message:
                'A Sefaz exige um certificado digital para essa conexão e não recebeu um válido.',
            httpStatus: status,
            detail: truncate(body),
        };
    }

    return {
        success: false,
        message: `A Sefaz respondeu com um erro inesperado (HTTP ${status}).`,
        httpStatus: status,
        detail: truncate(body),
    };
}

function interpretConnectionError(error: any): ConnectionTestResult {
    const code = String(error?.code || '');
    const message = String(error?.message || error);
    const lowerMessage = message.toLowerCase();

    if (message === 'TIMEOUT') {
        return {
            success: false,
            message:
                'A Sefaz não respondeu a tempo. Tente novamente em alguns minutos.',
        };
    }

    // "Unsupported PKCS12 PFX data" (ERR_CRYPTO_UNSUPPORTED_OPERATION) não é
    // senha errada — é o Node/OpenSSL 3 recusando um .pfx exportado com
    // criptografia antiga (RC2/3DES), comum em certificados e-CNPJ mais
    // antigos. A senha pode estar certinha.
    const looksLikeUnsupportedCipher =
        code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION' ||
        lowerMessage.includes('unsupported pkcs12');

    if (looksLikeUnsupportedCipher) {
        return {
            success: false,
            message:
                'O certificado usa uma criptografia PKCS12 antiga que o Node.js não abre por padrão (não é senha errada). É preciso habilitar o provedor legado do OpenSSL no backend — avise que eu ajusto o comando de start do servidor.',
            detail: message,
        };
    }

    const looksLikeWrongPassword =
        lowerMessage.includes('mac verify') ||
        code.includes('PKCS12_MAC');

    if (looksLikeWrongPassword) {
        return {
            success: false,
            message:
                'Não foi possível abrir o certificado. A senha cadastrada provavelmente está incorreta.',
            detail: message,
        };
    }

    return {
        success: false,
        message:
            'Erro de conexão com a Sefaz. Verifique sua internet e tente novamente.',
        detail: `${code ? `${code}: ` : ''}${message}`,
    };
}

function truncate(text: string, max = 500) {
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
}
