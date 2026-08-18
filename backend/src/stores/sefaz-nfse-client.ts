import { request } from 'https';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

import { decryptSecret, type EncryptedSecret } from './certificate-crypto.util';

// Só a especificação da API (não é dado sensível), salva pra eu conseguir
// ler o contrato completo sem depender de copiar/colar um JSON gigante.
const diagnosticsPath = join(process.cwd(), 'storage', 'diagnostics');

if (!existsSync(diagnosticsPath)) {
    mkdirSync(diagnosticsPath, { recursive: true });
}

// Ambiente de homologação (chamado de "produção restrita" pela Sefaz) do
// Ambiente de Dados Nacional da NFS-e. Usado enquanto validamos a conexão
// antes de ir pra produção de verdade.
const HOMOLOGACAO_BASE_URL =
    'https://adn.producaorestrita.nfse.gov.br';

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

// Tenta ler o NSU 0 (Número Sequencial Único) — o primeiro método da API de
// distribuição do ADN. Não baixa nem grava nada; só confirma que o
// certificado autentica e a Sefaz responde.
export async function testCertificateConnection(
    pfxPath: string,
    encryptedPassword: EncryptedSecret,
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
            `${HOMOLOGACAO_BASE_URL}/contribuintes/DFe/0`,
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
): Promise<LoteDistribuicaoNSUResponse> {
    const response = await mtlsGet(
        `${HOMOLOGACAO_BASE_URL}/contribuintes/DFe/${nsu}?lote=true`,
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
