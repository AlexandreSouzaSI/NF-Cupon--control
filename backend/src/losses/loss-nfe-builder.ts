import { SignedXml } from 'xml-crypto';

import {
    escapeXml,
    extractKeyAndCertPem,
    formatDhEventoBrasilia,
} from '../stores/sefaz-nfe-client';
import type { LoadedCertificate } from '../stores/sefaz-nfse-client';

// ---------------------------------------------------------------------
// NF-e de baixa de estoque por perda ("Nota de Débito", finNFe=6,
// tpNFDebito=07 — hipótese "Perda em Estoque") — Ajuste SINIEF nº 49/2025,
// em vigor desde 04/05/2026, formalizado na Nota Técnica 2025/002.
//
// Diferente de tudo que este projeto já emite/consome (que são só leitura
// da Sefaz), essa é a primeira NF-e que o próprio GestIA monta e
// assina — nota emitida pela loja PARA ELA MESMA (emit === dest), sem
// venda nem circulação de mercadoria de verdade, só formalizando a baixa
// do produto perdido/roubado/deteriorado do estoque, com CFOP 5.927.
//
// IMPORTANTE — isso é regulamentação muito recente (o ajuste começou a
// valer em maio/2026). A estrutura do XML abaixo foi montada a partir de
// pesquisa feita em ago/set de 2026 (Ajuste SINIEF 49/2025 + Nota Técnica
// 2025/002) e ainda não foi validada contra o schema oficial (XSD) da
// Sefaz nem testada de ponta a ponta em homologação. Antes de qualquer
// emissão em produção (com valor fiscal real), confirme com o contador:
//   - se o CFOP 5.927 e o texto de infAdFisco estão de acordo com o caso
//     de uso real (perecimento, quebra, roubo/furto etc.);
//   - se é necessário destacar ICMS/estornar crédito de ICMS/PIS/COFINS
//     aproveitado na entrada (Ajuste SINIEF 20/2026 mudou a regra de "sem
//     destaque" pra "destaque, se for o caso") — este builder NÃO calcula
//     estorno de crédito, monta os itens como não tributados/isentos;
//   - se o CST/cClassTrib do IBS/CBS (grupo <IBSCBS>, Reforma Tributária —
//     Nota Técnica 2025.002, obrigatória em produção pro Lucro Real desde
//     ago/2026) está correto pro caso de uso — o padrão aqui é CST 410
//     (Imunidade e não incidência) com cClassTrib "410001" de EXEMPLO,
//     ambos editáveis por nota. Essa parte do XML foi montada a partir de
//     pesquisa em blogs/informes técnicos de jan/2026, NÃO validada ainda
//     contra o XSD oficial da Sefaz nem testada em homologação — antes de
//     emitir em produção, valide a NF gerada em homologação e confira com
//     o contador se os valores batem com a tabela oficial cClassTrib.
export type LossNfeItem = {
    descricao: string;
    // NCM (8 dígitos) — obrigatório pela Sefaz. Se o produto perdido não
    // tiver um NCM cadastrado, cai num genérico de alimentos/bebidas
    // ("outras preparações alimentícias") só pra não travar o teste em
    // homologação — não use esse fallback numa emissão real.
    ncm?: string;
    quantidade: number;
    unidade: string;
    valorUnitario: number;
};

export type LossNfeStoreData = {
    cnpj: string;
    nome: string;
    uf: string;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    municipio?: string | null;
    codigoMunicipioIbge?: string | null;
    cep?: string | null;
    inscricaoEstadual?: string | null;
    // Regime tributário (CRT da Sefaz): 1 = Simples Nacional, 3 = Regime
    // Normal (cobre tanto Lucro Presumido quanto Lucro Real — não existe
    // CRT específico pra Real). Quem chama decide com base no
    // TaxRegimeConfig vigente da loja; sem config cadastrada, assume 3.
    crt: 1 | 3;
};

export type BuildLossNfeParams = {
    store: LossNfeStoreData;
    serie: number;
    numero: number;
    tpAmb: 1 | 2;
    justificativa: string;
    itens: LossNfeItem[];
    dataEmissao?: Date;
    // CFOP da baixa — não é mais fixo: o padrão sugerido (5.927, Ajuste
    // SINIEF 49/2025) vale pra maioria dos casos de perda/quebra/perecimento,
    // mas o contador pode pedir outro CFOP conforme o caso (ex: roubo/furto,
    // regras específicas por UF). Sem valor informado, cai no padrão.
    cfop?: string;
    // CST e cClassTrib do IBS/CBS (Reforma Tributária, NT 2025.002) —
    // mesma lógica do CFOP: sugestão padrão editável, nunca fixa no
    // código, porque só o contador confirma o enquadramento certo.
    // Ver aviso completo no topo do arquivo.
    cstIbsCbs?: string;
    cClassTrib?: string;
};

export type BuiltLossNfe = {
    chaveAcesso: string;
    xml: string;
    valorTotal: number;
};

const DEFAULT_NCM = '21069090';
export const CFOP_BAIXA_PERDA_PADRAO = '5927';

// CST 410 = "Imunidade e não incidência" (tabela oficial de CST-IBS/CBS,
// Informe Técnico RT 2025.002) — sugestão padrão pra baixa de perda, já
// que não há circulação econômica de mercadoria de verdade.
//
// cClassTrib "410030" = "Estorno de crédito por perecimento/deterioração/
// roubo/furto/extravio" — É O ÚNICO cClassTrib que a Sefaz aceita
// combinado com tpNFDebito=07 (regra UB14-70, rejeição 1200 -
// "cClassTrib incompatível com o tipo de Nota de Débito"). Tentamos antes
// o "410031" (usado por outros sistemas como atalho pra estoque sem
// crédito prévio), mas a Sefaz rejeitou mesmo assim — pra Nota de
// Débito tipo 07 especificamente, só 410030 passa na validação.
//
// 410030 exige o grupo <gEstornoCred> (valores de IBS/CBS estornados) em
// vez do <gIBSCBS> genérico de cálculo — ver buildDetXml. Como o sistema
// não rastreia quanto de crédito foi apropriado na compra original (e,
// na prática, a maioria das compras em 2026 ainda não vem com IBS/CBS
// destacado — período de transição), os valores ficam zerados: não há
// nada pra estornar de verdade ainda, só formaliza a nota no formato que
// a Sefaz exige.
export const CST_IBS_CBS_PADRAO = '410';
export const CCLASSTRIB_PADRAO = '410030';

// Código do IBGE da UF — mesma tabela usada em sefaz-nfe-client.ts, mas
// duplicada aqui (arquivo pequeno, sem valor em criar acoplamento só por
// isso) pra gerar o cUF da chave de acesso e do <ide>.
const UF_CODES: Record<string, number> = {
    AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
    MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
    RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

function ufToCode(uf: string): number {
    const code = UF_CODES[uf.trim().toUpperCase()];

    if (!code) {
        throw new Error(`UF "${uf}" não reconhecida.`);
    }

    return code;
}

// Dígito verificador da chave de acesso (mod-11, pesos 2..9 ciclando a
// partir do dígito mais à direita) — algoritmo padrão de todos os
// documentos da família NF-e/CT-e/MDF-e.
function calcularDV(chave43: string): number {
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;

    for (let i = 0; i < chave43.length; i++) {
        const digito = Number(chave43[chave43.length - 1 - i]);
        soma += digito * pesos[i % pesos.length];
    }

    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
}

function gerarCNF(): string {
    return String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
}

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

// AAMM da chave de acesso é o mês de emissão no horário de Brasília, não
// no fuso do servidor.
function aammBrasilia(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
    }).formatToParts(date);

    const year = parts.find((p) => p.type === 'year')?.value.slice(2) || '00';
    const month = parts.find((p) => p.type === 'month')?.value || '01';

    return `${year}${month}`;
}

export function gerarChaveAcesso(params: {
    ufCode: number;
    cnpj: string;
    serie: number;
    numero: number;
    dataEmissao: Date;
}): string {
    const cnpjDigits = params.cnpj.replace(/\D/g, '').padStart(14, '0');
    const cUF = String(params.ufCode).padStart(2, '0');
    const aamm = aammBrasilia(params.dataEmissao);
    const mod = '55';
    const serie = String(params.serie).padStart(3, '0');
    const nNF = String(params.numero).padStart(9, '0');
    const tpEmis = '1';
    const cNF = gerarCNF();

    const chave43 = `${cUF}${aamm}${cnpjDigits}${mod}${serie}${nNF}${tpEmis}${cNF}`;
    const dv = calcularDV(chave43);

    return `${chave43}${dv}`;
}

function buildEnderecoXml(tag: 'enderEmit' | 'enderDest', store: LossNfeStoreData): string {
    return (
        `<${tag}>` +
        `<xLgr>${escapeXml(store.logradouro || 'Não informado')}</xLgr>` +
        `<nro>${escapeXml(store.numero || 'S/N')}</nro>` +
        (store.complemento ? `<xCpl>${escapeXml(store.complemento)}</xCpl>` : '') +
        `<xBairro>${escapeXml(store.bairro || 'Não informado')}</xBairro>` +
        `<cMun>${escapeXml(store.codigoMunicipioIbge || '')}</cMun>` +
        `<xMun>${escapeXml(store.municipio || '')}</xMun>` +
        `<UF>${escapeXml(store.uf)}</UF>` +
        `<CEP>${escapeXml((store.cep || '').replace(/\D/g, ''))}</CEP>` +
        `<cPais>1058</cPais>` +
        `<xPais>BRASIL</xPais>` +
        `</${tag}>`
    );
}

function buildDetXml(
    item: LossNfeItem,
    nItem: number,
    crt: 1 | 3,
    cfop: string,
    cstIbsCbs: string,
    cClassTrib: string,
): { xml: string; vProd: number } {
    const vUnCom = round2(item.valorUnitario);
    const vProd = round2(item.quantidade * vUnCom);
    const cProd = `PERDA${String(nItem).padStart(4, '0')}`;
    const ncm = (item.ncm || DEFAULT_NCM).replace(/\D/g, '').padEnd(8, '0').slice(0, 8);

    // Sem destaque de ICMS/PIS/COFINS — ver aviso no topo do arquivo sobre
    // estorno de crédito, que precisa ser calculado com o contador antes
    // de uma emissão real. Aqui só formaliza a baixa em quantidade/valor.
    const icmsXml =
        crt === 1
            ? `<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>`
            : `<ICMS40><orig>0</orig><CST>40</CST></ICMS40>`;

    // Grupo IBS/CBS (Reforma Tributária, NT 2025.002) — período de
    // convivência com ICMS/PIS/COFINS (ambos coexistem na nota até a
    // extinção total em 2033), por isso fica ao lado dos grupos antigos
    // acima, não no lugar deles.
    //
    // Estrutura conferida contra o XML de exemplo oficial da Receita
    // Federal (schema PL_010b_NT2025_002_v1.30/procNFe_v4.00.xsd,
    // publicado em gov.br/receitafederal, manual "Documento XML NFe"):
    // cClassTrib é filho direto de <IBSCBS> (irmão de <CST>, ANTES de
    // <gIBSCBS>) e <gIBSCBS> precisa do totalizador <vIBS> entre
    // <gIBSMun> e <gCBS>.
    //
    // MAS: a Sefaz rejeitou (1021 - "Grupo IBS/CBS informado indevidamente")
    // quando o <gIBSCBS> era enviado junto com CST 410 (Imunidade e não
    // incidência) — a "Tabela de Indicadores do CST" do Informe Técnico
    // 2025.002 define, por CST, se o grupo de cálculo pode/deve ser
    // enviado. Pra CSTs que representam ausência total de fato gerador
    // (400=Isenção, 410=Imunidade/não incidência), o grupo <gIBSCBS> NÃO
    // deve ser enviado, só <CST> + <cClassTrib>.
    //
    // E pra cClassTrib 410030 especificamente ("Estorno de crédito por
    // perecimento/deterioração/roubo/furto/extravio" — o único aceito
    // junto com tpNFDebito=07, ver aviso no topo do arquivo), a Sefaz
    // exige em vez disso o grupo <gEstornoCred> com os valores de IBS/CBS
    // estornados. Como o sistema não rastreia crédito apropriado na
    // compra original (a maioria das compras em 2026 ainda não destaca
    // IBS/CBS), os valores ficam zerados — não há nada pra estornar de
    // verdade ainda, só formaliza a nota no formato que a Sefaz exige.
    //
    // IMPORTANTE — o leiaute oficial (Sankhya, doc de Nota de Débito tipo
    // 07) também pede um <DFeReferenciado><chaveAcesso> por item,
    // apontando pra NF de compra original do produto perdido. O sistema
    // ainda não guarda esse vínculo (ProductLoss não sabe de qual compra
    // veio cada item) — se a Sefaz rejeitar por falta desse campo, essa é
    // a próxima peça a implementar.
    const cstsSemGrupoDeCalculo = ['400', '410'];
    const ehEstornoPorPerda = cClassTrib.trim() === '410030';
    const precisaGrupoDeCalculo =
        !ehEstornoPorPerda && !cstsSemGrupoDeCalculo.includes(cstIbsCbs.trim());

    const ibsCbsXml =
        `<IBSCBS>` +
        `<CST>${escapeXml(cstIbsCbs)}</CST>` +
        `<cClassTrib>${escapeXml(cClassTrib)}</cClassTrib>` +
        (ehEstornoPorPerda
            ? `<gEstornoCred><vIBSEstCred>0.00</vIBSEstCred><vCBSEstCred>0.00</vCBSEstCred></gEstornoCred>`
            : precisaGrupoDeCalculo
              ? `<gIBSCBS>` +
                `<vBC>0.00</vBC>` +
                `<gIBSUF><pIBSUF>0.00</pIBSUF><vIBSUF>0.00</vIBSUF></gIBSUF>` +
                `<gIBSMun><pIBSMun>0.00</pIBSMun><vIBSMun>0.00</vIBSMun></gIBSMun>` +
                `<vIBS>0.00</vIBS>` +
                `<gCBS><pCBS>0.00</pCBS><vCBS>0.00</vCBS></gCBS>` +
                `</gIBSCBS>`
              : '') +
        `</IBSCBS>`;

    const impostoXml =
        `<imposto>` +
        `<ICMS>${icmsXml}</ICMS>` +
        `<PIS><PISNT><CST>08</CST></PISNT></PIS>` +
        `<COFINS><COFINSNT><CST>08</CST></COFINSNT></COFINS>` +
        ibsCbsXml +
        `</imposto>`;

    const prodXml =
        `<prod>` +
        `<cProd>${escapeXml(cProd)}</cProd>` +
        `<cEAN>SEM GTIN</cEAN>` +
        `<xProd>${escapeXml(item.descricao)}</xProd>` +
        `<NCM>${ncm}</NCM>` +
        `<CFOP>${escapeXml(cfop)}</CFOP>` +
        `<uCom>${escapeXml(item.unidade || 'UN')}</uCom>` +
        `<qCom>${item.quantidade.toFixed(4)}</qCom>` +
        `<vUnCom>${vUnCom.toFixed(10)}</vUnCom>` +
        `<vProd>${vProd.toFixed(2)}</vProd>` +
        `<cEANTrib>SEM GTIN</cEANTrib>` +
        `<uTrib>${escapeXml(item.unidade || 'UN')}</uTrib>` +
        `<qTrib>${item.quantidade.toFixed(4)}</qTrib>` +
        `<vUnTrib>${vUnCom.toFixed(10)}</vUnTrib>` +
        `<indTot>1</indTot>` +
        `</prod>`;

    // vItem (valor total do item, NT 2025.002) — campo novo, filho direto
    // de <det>, depois de <imposto>. No exemplo oficial da Receita
    // Federal é igual ao vProd do item (sem desconto/acréscimo por item
    // nessa nota).
    const vItemXml = `<vItem>${vProd.toFixed(2)}</vItem>`;

    return {
        xml: `<det nItem="${nItem}">${prodXml}${impostoXml}${vItemXml}</det>`,
        vProd,
    };
}

// Monta o infNFe (ainda sem assinatura) — emit e dest são a mesma loja,
// já que essa nota não representa venda nem transferência, só a baixa
// formal do estoque perdido.
function buildInfNFeXml(params: BuildLossNfeParams, chaveAcesso: string): string {
    const { store, serie, numero, tpAmb, justificativa, itens } = params;
    const dataEmissao = params.dataEmissao || new Date();
    const cUF = ufToCode(store.uf);
    const cnpjDigits = store.cnpj.replace(/\D/g, '');
    const cfop = (params.cfop || CFOP_BAIXA_PERDA_PADRAO).trim();
    const cstIbsCbs = (params.cstIbsCbs || CST_IBS_CBS_PADRAO).trim();
    const cClassTrib = (params.cClassTrib || CCLASSTRIB_PADRAO).trim();

    const detsBuilt = itens.map((item, index) =>
        buildDetXml(item, index + 1, store.crt, cfop, cstIbsCbs, cClassTrib),
    );
    const detsXml = detsBuilt.map((d) => d.xml).join('');
    const vProdTotal = round2(detsBuilt.reduce((sum, d) => sum + d.vProd, 0));

    // cNF é o mesmo número aleatório de 8 dígitos usado pra gerar a chave
    // de acesso (posições 36-43 da chave, base 0) — a Sefaz confere que o
    // valor aqui bate com o que está embutido na chave. Faltar esse campo
    // (era esquecido antes) já é suficiente pra rejeitar o lote inteiro
    // por falha de schema (cStat 225), mesmo com todo o resto correto.
    const cNF = chaveAcesso.slice(35, 43);

    const ideXml =
        `<ide>` +
        `<cUF>${cUF}</cUF>` +
        `<cNF>${cNF}</cNF>` +
        `<natOp>${escapeXml('Baixa de estoque por perda')}</natOp>` +
        `<mod>55</mod>` +
        `<serie>${serie}</serie>` +
        `<nNF>${numero}</nNF>` +
        `<dhEmi>${formatDhEventoBrasilia(dataEmissao)}</dhEmi>` +
        `<tpNF>1</tpNF>` +
        `<idDest>1</idDest>` +
        `<cMunFG>${escapeXml(store.codigoMunicipioIbge || '')}</cMunFG>` +
        `<tpImp>1</tpImp>` +
        `<tpEmis>1</tpEmis>` +
        `<cDV>${chaveAcesso.slice(-1)}</cDV>` +
        `<tpAmb>${tpAmb}</tpAmb>` +
        `<finNFe>6</finNFe>` +
        `<tpNFDebito>07</tpNFDebito>` +
        `<indFinal>1</indFinal>` +
        `<indPres>9</indPres>` +
        `<indIntermed>0</indIntermed>` +
        `<procEmi>0</procEmi>` +
        `<verProc>GestIA 1.0</verProc>` +
        `</ide>`;

    const emitXml =
        `<emit>` +
        `<CNPJ>${cnpjDigits}</CNPJ>` +
        `<xNome>${escapeXml(store.nome)}</xNome>` +
        buildEnderecoXml('enderEmit', store) +
        (store.inscricaoEstadual
            ? `<IE>${escapeXml(store.inscricaoEstadual.replace(/\D/g, ''))}</IE>`
            : `<IE>ISENTO</IE>`) +
        `<CRT>${store.crt}</CRT>` +
        `</emit>`;

    // dest = o próprio emitente — a nota é pra si mesmo, então repete os
    // mesmos dados (indIEDest reflete se a loja é contribuinte de ICMS).
    const indIEDest = store.inscricaoEstadual ? '1' : '9';

    // Em homologação a Sefaz EXIGE esse texto literal como razão social
    // do destinatário (independente de quem seja de verdade) — é assim
    // que ela marca a nota como teste sem valor fiscal. Usar o nome real
    // da loja aqui rejeita com cStat 598. Só se aplica com tpAmb=2; em
    // produção usa o nome de verdade.
    const xNomeDest =
        tpAmb === 2
            ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
            : store.nome;

    const destXml =
        `<dest>` +
        `<CNPJ>${cnpjDigits}</CNPJ>` +
        `<xNome>${escapeXml(xNomeDest)}</xNome>` +
        buildEnderecoXml('enderDest', store) +
        `<indIEDest>${indIEDest}</indIEDest>` +
        (store.inscricaoEstadual
            ? `<IE>${escapeXml(store.inscricaoEstadual.replace(/\D/g, ''))}</IE>`
            : '') +
        `</dest>`;

    const totalXml =
        `<total><ICMSTot>` +
        `<vBC>0.00</vBC>` +
        `<vICMS>0.00</vICMS>` +
        `<vICMSDeson>0.00</vICMSDeson>` +
        `<vFCP>0.00</vFCP>` +
        `<vBCST>0.00</vBCST>` +
        `<vST>0.00</vST>` +
        `<vFCPST>0.00</vFCPST>` +
        `<vFCPSTRet>0.00</vFCPSTRet>` +
        `<vProd>${vProdTotal.toFixed(2)}</vProd>` +
        `<vFrete>0.00</vFrete>` +
        `<vSeg>0.00</vSeg>` +
        `<vDesc>0.00</vDesc>` +
        `<vII>0.00</vII>` +
        `<vIPI>0.00</vIPI>` +
        `<vIPIDevol>0.00</vIPIDevol>` +
        `<vPIS>0.00</vPIS>` +
        `<vCOFINS>0.00</vCOFINS>` +
        `<vOutro>0.00</vOutro>` +
        `<vNF>${vProdTotal.toFixed(2)}</vNF>` +
        `</ICMSTot>` +
        // Totalizador do IBS/CBS (NT 2025.002) — nomes e campos conferidos
        // contra o XML de exemplo oficial da Receita Federal (ver aviso
        // detalhado em buildDetXml): dentro de <gIBS>/<gCBS> os subgrupos
        // se chamam <gIBSUF>/<gIBSMun>/<gCBS> (SEM sufixo "Tot" — a versão
        // anterior deste arquivo usava gIBSUFTot/gIBSMunTot/gCBSTot, que
        // não existem no schema), e cada um precisa de vCredPres e
        // vCredPresCondSus além de vDif/vDevTrib. Com CST 410 (padrão)
        // tudo fica zerado.
        `<IBSCBSTot>` +
        `<vBCIBSCBS>0.00</vBCIBSCBS>` +
        `<gIBS>` +
        `<gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>0.00</vIBSUF></gIBSUF>` +
        `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>0.00</vIBSMun></gIBSMun>` +
        `<vIBS>0.00</vIBS>` +
        `<vCredPres>0.00</vCredPres>` +
        `<vCredPresCondSus>0.00</vCredPresCondSus>` +
        `</gIBS>` +
        `<gCBS>` +
        `<vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>0.00</vCBS>` +
        `<vCredPres>0.00</vCredPres>` +
        `<vCredPresCondSus>0.00</vCredPresCondSus>` +
        `</gCBS>` +
        `</IBSCBSTot>` +
        // vNFTot (valor total da NF, NT 2025.002) — campo novo, filho
        // direto de <total>, depois de <IBSCBSTot>. Mesmo valor de vNF
        // no ICMSTot, já que essa nota não tem outras despesas.
        `<vNFTot>${vProdTotal.toFixed(2)}</vNFTot>` +
        `</total>`;

    // modFrete=9 (sem transporte/sem frete) — não há movimentação de
    // mercadoria de verdade, é só a baixa formal.
    const transpXml = `<transp><modFrete>9</modFrete></transp>`;

    // tPag=90 (Sem pagamento) — não existe contraprestação financeira
    // nessa nota, é só a formalização fiscal da baixa.
    const pagXml =
        `<pag><detPag><tPag>90</tPag><vPag>0.00</vPag></detPag></pag>`;

    const infAdicXml =
        `<infAdic><infAdFisco>${escapeXml(justificativa)}</infAdFisco></infAdic>`;

    return (
        `<infNFe Id="NFe${chaveAcesso}" versao="4.00">` +
        ideXml +
        emitXml +
        destXml +
        detsXml +
        totalXml +
        transpXml +
        pagXml +
        infAdicXml +
        `</infNFe>`
    );
}

// Monta e assina (XML-DSig, RSA-SHA1 + C14N — mesmo padrão já usado pra
// assinar o evento de manifestação em sefaz-nfe-client.ts, só que aqui a
// referência é o infNFe inteiro em vez de um infEvento) a NF-e de baixa
// de estoque por perda.
export function buildAndSignLossNfe(
    cert: LoadedCertificate,
    params: BuildLossNfeParams,
): BuiltLossNfe {
    if (params.itens.length === 0) {
        throw new Error('Selecione ao menos uma perda com valor unitário definido.');
    }

    const dataEmissao = params.dataEmissao || new Date();
    const ufCode = ufToCode(params.store.uf);

    const chaveAcesso = gerarChaveAcesso({
        ufCode,
        cnpj: params.store.cnpj,
        serie: params.serie,
        numero: params.numero,
        dataEmissao,
    });

    const infNFeXml = buildInfNFeXml({ ...params, dataEmissao }, chaveAcesso);
    const nfeXml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${infNFeXml}</NFe>`;

    const { privateKeyPem, certPem } = extractKeyAndCertPem(cert);

    const sig = new SignedXml({
        privateKey: privateKeyPem,
        publicCert: certPem,
        signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
        canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    sig.addReference({
        xpath: "//*[local-name(.)='infNFe']",
        transforms: [
            'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
            'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
        ],
        digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });

    sig.computeSignature(nfeXml, {
        location: {
            reference: "//*[local-name(.)='infNFe']",
            action: 'after',
        },
    });

    const signedNfeXml = sig.getSignedXml();
    const vProdTotal = round2(
        params.itens.reduce((sum, item) => sum + item.quantidade * round2(item.valorUnitario), 0),
    );

    return {
        chaveAcesso,
        xml: `<?xml version="1.0" encoding="UTF-8"?>${signedNfeXml}`,
        valorTotal: vProdTotal,
    };
}
