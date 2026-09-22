// Gerador do arquivo de REMESSA CNAB 240 (layout FEBRABAN padrão,
// banco 748 = Sicredi) pra "lançamento em lote": pagar de uma vez, via
// upload no internet banking do Sicredi, os boletos (Segmento J, código
// de barras) e PIX (Segmento A + B, chave/transferência) das contas
// marcadas pra "pagamentos de hoje".
//
// ⚠️ IMPORTANTE — leia antes de usar de verdade:
// Este arquivo segue o layout FEBRABAN CNAB 240 documentado publicamente
// (o mesmo padrão usado pela maioria dos bancos, incluindo o Sicredi),
// mas alguns detalhes finos (versão exata do layout de arquivo/lote,
// formato do código do convênio, e principalmente a parte de PIX via
// CNAB — que é mais recente e varia mais entre bancos) podem precisar de
// ajuste conforme o manual técnico específico do Sicredi. Antes de subir
// um arquivo de verdade, valide com o gerente/suporte do Sicredi (ou no
// ambiente de homologação, se disponível) — principalmente o primeiro
// arquivo gerado. Os campos "versão do layout" ficam como constante aqui
// embaixo (VERSAO_LAYOUT_ARQUIVO / VERSAO_LAYOUT_LOTE) pra ajustar fácil
// se o Sicredi pedir um valor diferente.

const VERSAO_LAYOUT_ARQUIVO = '103';
const VERSAO_LAYOUT_LOTE = '040';
const DENSIDADE_GRAVACAO = '01600';
const NOME_BANCO = 'BANCO COOPERATIVO SICREDI S.A.';

export type ConvenioConfig = {
    bankCode: string;
    convenioCode: string;
    agencia: string;
    agenciaDv: string | null;
    conta: string;
    contaDv: string | null;
    companyName: string;
    companyCnpj: string;
};

export type BoletoPagamento = {
    billId: string;
    barcode: string; // código de barras (44 dígitos) ou linha digitável (47)
    value: number;
    dueDate: Date; // data de vencimento do boleto (não a data de pagamento)
    paymentDate: Date; // data em que o pagamento deve ser efetivado
    beneficiary: string | null;
    description: string;
};

export type PixPagamento = {
    billId: string;
    value: number;
    paymentDate: Date;
    beneficiary: string | null;
    bankName: string | null;
    bankAgency: string | null;
    bankAccount: string | null;
    pixKey: string | null;
    description: string;
};

// Remove acento/caractere especial — CNAB é ASCII puro, banco costuma
// rejeitar o arquivo inteiro se achar um caractere fora da tabela.
function semAcento(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\x20-\x7E]/g, '');
}

function alfa(texto: string | null | undefined, tamanho: number): string {
    const limpo = semAcento(texto || '').toUpperCase();
    return limpo.slice(0, tamanho).padEnd(tamanho, ' ');
}

function num(valor: string | number | null | undefined, tamanho: number): string {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    return digitos.slice(-tamanho).padStart(tamanho, '0');
}

// Valor monetário em centavos, sem separador, alinhado à direita — ex:
// R$ 1.234,56 com tamanho 15 -> "000000000123456".
function valorCentavos(valor: number, tamanho = 15): string {
    const centavos = Math.round(valor * 100);
    return String(centavos).padStart(tamanho, '0');
}

function dataDDMMAAAA(data: Date): string {
    const dd = String(data.getDate()).padStart(2, '0');
    const mm = String(data.getMonth() + 1).padStart(2, '0');
    const yyyy = String(data.getFullYear());
    return `${dd}${mm}${yyyy}`;
}

function horaHHMMSS(data: Date): string {
    const hh = String(data.getHours()).padStart(2, '0');
    const mi = String(data.getMinutes()).padStart(2, '0');
    const ss = String(data.getSeconds()).padStart(2, '0');
    return `${hh}${mi}${ss}`;
}

function branco(tamanho: number): string {
    return ' '.repeat(tamanho);
}

function zero(tamanho: number): string {
    return '0'.repeat(tamanho);
}

// Junta pedaços de tamanho fixo e confere que a linha bate 240 —
// se algum segmento tiver o tamanho errado, prefiro quebrar aqui em vez
// de gerar um arquivo com colunas deslocadas (erro silencioso é pior).
function montarLinha(...partes: string[]): string {
    const linha = partes.join('');

    if (linha.length !== 240) {
        throw new Error(
            `Linha CNAB com tamanho errado: ${linha.length} (esperado 240). ` +
            `Conteúdo: "${linha}"`,
        );
    }

    return linha;
}

function inscricaoTipoENumero(cnpjOuCpf: string): { tipo: string; numero: string } {
    const digitos = cnpjOuCpf.replace(/\D/g, '');
    return digitos.length > 11
        ? { tipo: '2', numero: num(digitos, 14) }
        : { tipo: '1', numero: num(digitos, 14) };
}

function headerArquivo(
    convenio: ConvenioConfig,
    agora: Date,
    nsa: number,
): string {
    const { tipo, numero } = inscricaoTipoENumero(convenio.companyCnpj);

    return montarLinha(
        num(convenio.bankCode, 3),
        zero(4), // lote de serviço = 0000 no header de arquivo
        '0', // tipo de registro
        branco(9),
        tipo,
        numero,
        alfa(convenio.convenioCode, 20),
        num(convenio.agencia, 5),
        alfa(convenio.agenciaDv || '', 1),
        num(convenio.conta, 12),
        alfa(convenio.contaDv || '', 1),
        branco(1), // DV agência/conta (deixado em branco — Sicredi normalmente não usa)
        alfa(convenio.companyName, 30),
        alfa(NOME_BANCO, 30),
        branco(10),
        '1', // 1 = arquivo de remessa (empresa -> banco)
        dataDDMMAAAA(agora),
        horaHHMMSS(agora),
        num(nsa, 6),
        VERSAO_LAYOUT_ARQUIVO,
        DENSIDADE_GRAVACAO,
        branco(20), // reservado banco
        branco(20), // reservado empresa
        branco(29),
    );
}

function headerLote(
    convenio: ConvenioConfig,
    numeroLote: number,
    formaLancamento: string, // '30' = boleto código de barras | '45' = PIX transferência
    enderecoEmpresa?: {
        logradouro?: string;
        numero?: string;
        cidade?: string;
        cep?: string;
        uf?: string;
    },
): string {
    const { tipo, numero } = inscricaoTipoENumero(convenio.companyCnpj);
    const endereco = enderecoEmpresa || {};

    return montarLinha(
        num(convenio.bankCode, 3),
        num(numeroLote, 4),
        '1', // tipo de registro
        'C', // C = crédito
        '20', // tipo de serviço: pagamento a fornecedores
        formaLancamento,
        VERSAO_LAYOUT_LOTE,
        branco(1),
        tipo,
        numero,
        alfa(convenio.convenioCode, 20),
        num(convenio.agencia, 5),
        alfa(convenio.agenciaDv || '', 1),
        num(convenio.conta, 12),
        alfa(convenio.contaDv || '', 1),
        branco(1),
        alfa(convenio.companyName, 30),
        branco(40), // mensagem 1
        alfa(endereco.logradouro || '', 30),
        num(endereco.numero || '0', 5),
        branco(15), // complemento
        alfa(endereco.cidade || '', 20),
        num((endereco.cep || '').replace(/\D/g, '').slice(0, 5), 5),
        alfa((endereco.cep || '').replace(/\D/g, '').slice(5, 8), 3),
        alfa(endereco.uf || '', 2),
        branco(10), // indicativo forma de pagamento do serviço/tarifa
        branco(10),
    );
}

function trailerLote(numeroLote: number, quantidadeRegistros: number): string {
    // +2 conta o próprio header e trailer do lote na contagem exigida
    // pelo layout (quantidade de registros do lote inclui essas duas
    // linhas, não só os segmentos).
    return montarLinha(
        num('748', 3),
        num(numeroLote, 4),
        '5',
        branco(9),
        num(quantidadeRegistros + 2, 6),
        zero(18), // somatória de valores (não obrigatório pra pagamento fornecedor)
        zero(18),
        zero(6),
        branco(165),
    );
}

// Segmento J — pagamento de título de cobrança via código de barras.
// Não depende de saber o banco/agência/conta do favorecido: o código de
// barras já identifica tudo isso pro Sicredi.
function segmentoJ(
    numeroLote: number,
    numeroSequencial: number,
    boleto: BoletoPagamento,
): string {
    const codigoBarras = boleto.barcode.replace(/\D/g, '').padEnd(44, '0').slice(0, 44);

    return montarLinha(
        num('748', 3),
        num(numeroLote, 4),
        '3', // tipo de registro
        num(numeroSequencial, 5),
        'J', // segmento
        branco(1),
        '00', // código de movimento (00 = inclusão)
        codigoBarras,
        alfa(boleto.beneficiary || '', 30),
        dataDDMMAAAA(boleto.dueDate),
        valorCentavos(boleto.value, 15), // valor do título
        zero(15), // valor do desconto/abatimento
        zero(15), // valor da mora/multa
        dataDDMMAAAA(boleto.paymentDate),
        valorCentavos(boleto.value, 15), // valor a ser pago
        zero(15), // quantidade de moeda
        num(boleto.billId.replace(/\D/g, '').slice(0, 15) || numeroSequencial, 15), // nosso número / uso da empresa
        branco(15),
        '0', // código da moeda (não usado)
        branco(13),
    );
}

// Segmento A — dados do pagamento em crédito de conta corrente/PIX
// transferência (forma de lançamento 45).
function segmentoA(
    numeroLote: number,
    numeroSequencial: number,
    pix: PixPagamento,
): string {
    const bancoFavorecido = num(pix.bankName ? pix.bankName.replace(/\D/g, '') : '0', 3);

    return montarLinha(
        num('748', 3),
        num(numeroLote, 4),
        '3',
        num(numeroSequencial, 5),
        'A',
        branco(1),
        '00', // código de movimento
        bancoFavorecido,
        num(pix.bankAgency || '0', 5),
        branco(1),
        num(pix.bankAccount || '0', 12),
        branco(1),
        branco(1),
        alfa(pix.beneficiary || '', 30),
        branco(20), // número do documento atribuído pela empresa
        dataDDMMAAAA(pix.paymentDate),
        'BRL',
        zero(15),
        valorCentavos(pix.value, 15),
        branco(20), // seu número (documento do banco)
        zero(8),
        zero(15),
        branco(40),
        '0', // aviso ao favorecido (0 = não emite)
    );
}

// Segmento B — complemento do Segmento A: CPF/CNPJ e, no caso de PIX
// transferência, a chave PIX do favorecido.
function segmentoB(
    numeroLote: number,
    numeroSequencial: number,
    pix: PixPagamento,
): string {
    const { tipo, numero } = inscricaoTipoENumero(pix.pixKey && /^\d+$/.test(pix.pixKey) ? pix.pixKey : '00000000000');

    return montarLinha(
        num('748', 3),
        num(numeroLote, 4),
        '3',
        num(numeroSequencial, 5),
        'B',
        tipo,
        numero,
        branco(30), // endereço do favorecido (não obrigatório aqui)
        branco(5),
        branco(15),
        branco(20),
        branco(2),
        branco(8),
        zero(8), // data de vencimento (não aplicável)
        zero(15),
        zero(15),
        zero(15),
        alfa(pix.pixKey || '', 99), // chave PIX (campo livre — confirmar posição exata com o Sicredi)
        branco(6),
    );
}

function trailerArquivo(quantidadeLotes: number, quantidadeRegistros: number): string {
    return montarLinha(
        num('748', 3),
        zero(4),
        '9',
        branco(9),
        num(quantidadeLotes, 6),
        num(quantidadeRegistros, 6),
        zero(6),
        branco(205),
    );
}

// Monta o arquivo completo: lote 1 (boletos, Segmento J) e lote 2 (PIX,
// Segmento A+B) — só entra o lote que tiver pelo menos 1 pagamento.
// Retorna o texto pronto pra salvar como .txt (uma linha de 240
// caracteres por registro, separadas por CRLF — padrão mais aceito
// pelos validadores de CNAB).
export function buildCnab240Remessa(
    convenio: ConvenioConfig,
    boletos: BoletoPagamento[],
    pixPagamentos: PixPagamento[],
    enderecoEmpresa?: {
        logradouro?: string;
        numero?: string;
        cidade?: string;
        cep?: string;
        uf?: string;
    },
): string {
    const agora = new Date();
    const linhas: string[] = [];

    linhas.push(headerArquivo(convenio, agora, 1));

    let numeroLote = 0;
    let totalRegistros = 2; // header + trailer de arquivo
    let quantidadeLotes = 0;

    if (boletos.length > 0) {
        numeroLote += 1;
        quantidadeLotes += 1;

        linhas.push(headerLote(convenio, numeroLote, '30', enderecoEmpresa));

        boletos.forEach((boleto, index) => {
            linhas.push(segmentoJ(numeroLote, index + 1, boleto));
        });

        linhas.push(trailerLote(numeroLote, boletos.length));

        totalRegistros += boletos.length + 2;
    }

    if (pixPagamentos.length > 0) {
        numeroLote += 1;
        quantidadeLotes += 1;

        linhas.push(headerLote(convenio, numeroLote, '45', enderecoEmpresa));

        let seq = 0;
        pixPagamentos.forEach((pix) => {
            seq += 1;
            linhas.push(segmentoA(numeroLote, seq, pix));
            seq += 1;
            linhas.push(segmentoB(numeroLote, seq, pix));
        });

        linhas.push(trailerLote(numeroLote, pixPagamentos.length * 2));

        totalRegistros += pixPagamentos.length * 2 + 2;
    }

    linhas.push(trailerArquivo(quantidadeLotes, totalRegistros));

    return linhas.join('\r\n') + '\r\n';
}
