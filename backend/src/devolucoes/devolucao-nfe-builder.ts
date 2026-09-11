import { SignedXml } from 'xml-crypto';

import {
    escapeXml,
    extractKeyAndCertPem,
    formatDhEventoBrasilia,
    ufToCode,
} from '../stores/sefaz-nfe-client';
import { gerarChaveAcesso } from '../losses/loss-nfe-builder';
import type { LoadedCertificate } from '../stores/sefaz-nfse-client';

// ---------------------------------------------------------------------
// NF-e de devolução de mercadoria (finNFe=4, CFOP na família 5.2xx/5.4xx/
// 5.5xx/6.2xx/6.4xx/6.5xx conforme o CFOP da compra original) — devolve
// ao FORNECEDOR uma ou mais mercadorias recebidas numa NF de entrada já
// conciliada, referenciando a chave de acesso original via <NFref><refNFe>.
//
// Diferente da LossNfe (emitida pra si mesma), aqui emit = a loja (quem
// está devolvendo) e dest = o fornecedor original (destinatário real da
// devolução). Suporta devolver só alguns itens — e quantidade parcial —
// de uma NF de entrada com muitos itens, não precisa devolver a nota
// inteira.
//
// IMPORTANTE — assim como a LossNfe, essa é uma NF que o próprio sistema
// monta e assina, mas ainda não valida contra o XSD oficial da Sefaz nem
// foi testada em homologação. Fica como RASCUNHO assinado (sem envio pro
// webservice de autorização) até essa fase ser implementada — combinado
// com o usuário. Antes de qualquer emissão real, confirme com o contador
// o CFOP de cada item (a tabela de sugestão em cfop-devolucao.ts cobre só
// os casos mais comuns) e o tratamento de ICMS/estorno de crédito.
export type DevolucaoNfeItem = {
    descricao: string;
    ncm?: string;
    cfop: string; // já resolvido (sugerido ou informado manualmente) — ver cfop-devolucao.ts
    quantidade: number;
    unidade: string;
    valorUnitario: number;
};

export type DevolucaoNfeStoreData = {
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
    // Regime tributário (CRT) — mesma lógica da LossNfe: 1 = Simples
    // Nacional, 3 = Regime Normal.
    crt: 1 | 3;
};

// Dados do fornecedor (destinatário da devolução), extraídos do <emit>
// da NF de compra original (ver DevolucoesService, que lê o XML salvo em
// IncomingGoodsNf.fileUrl e reaproveita parseFullNfeForView).
export type DevolucaoNfeFornecedorData = {
    cnpj: string;
    nome: string;
    uf?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    codigoMunicipioIbge?: string;
    cep?: string;
    inscricaoEstadual?: string;
};

export type BuildDevolucaoNfeParams = {
    store: DevolucaoNfeStoreData;
    fornecedor: DevolucaoNfeFornecedorData;
    refChaveAcesso: string; // chave de acesso da NF de compra original (44 dígitos)
    serie: number;
    numero: number;
    tpAmb: 1 | 2;
    motivo: string;
    itens: DevolucaoNfeItem[];
    dataEmissao?: Date;
};

export type BuiltDevolucaoNfe = {
    chaveAcesso: string;
    xml: string;
    valorTotal: number;
};

const DEFAULT_NCM = '21069090';

function round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildEnderecoXml(
    tag: 'enderEmit' | 'enderDest',
    data: {
        logradouro?: string | null;
        numero?: string | null;
        complemento?: string | null;
        bairro?: string | null;
        municipio?: string | null;
        codigoMunicipioIbge?: string | null;
        uf?: string | null;
        cep?: string | null;
    },
): string {
    return (
        `<${tag}>` +
        `<xLgr>${escapeXml(data.logradouro || 'Não informado')}</xLgr>` +
        `<nro>${escapeXml(data.numero || 'S/N')}</nro>` +
        (data.complemento ? `<xCpl>${escapeXml(data.complemento)}</xCpl>` : '') +
        `<xBairro>${escapeXml(data.bairro || 'Não informado')}</xBairro>` +
        `<cMun>${escapeXml(data.codigoMunicipioIbge || '')}</cMun>` +
        `<xMun>${escapeXml(data.municipio || '')}</xMun>` +
        `<UF>${escapeXml(data.uf || '')}</UF>` +
        `<CEP>${escapeXml((data.cep || '').replace(/\D/g, ''))}</CEP>` +
        `<cPais>1058</cPais>` +
        `<xPais>BRASIL</xPais>` +
        `</${tag}>`
    );
}

function buildDetXml(item: DevolucaoNfeItem, nItem: number, crt: 1 | 3): { xml: string; vProd: number } {
    const vUnCom = round2(item.valorUnitario);
    const vProd = round2(item.quantidade * vUnCom);
    const cProd = `DEVOL${String(nItem).padStart(4, '0')}`;
    const ncm = (item.ncm || DEFAULT_NCM).replace(/\D/g, '').padEnd(8, '0').slice(0, 8);

    // Sem destaque de ICMS/PIS/COFINS por padrão — assim como na LossNfe,
    // o estorno de crédito de ICMS/PIS/COFINS aproveitado na entrada
    // precisa ser avaliado com o contador antes de uma emissão real.
    const icmsXml =
        crt === 1
            ? `<ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102>`
            : `<ICMS40><orig>0</orig><CST>40</CST></ICMS40>`;

    const impostoXml =
        `<imposto>` +
        `<ICMS>${icmsXml}</ICMS>` +
        `<PIS><PISNT><CST>08</CST></PISNT></PIS>` +
        `<COFINS><COFINSNT><CST>08</CST></COFINSNT></COFINS>` +
        `</imposto>`;

    const prodXml =
        `<prod>` +
        `<cProd>${escapeXml(cProd)}</cProd>` +
        `<cEAN>SEM GTIN</cEAN>` +
        `<xProd>${escapeXml(item.descricao)}</xProd>` +
        `<NCM>${ncm}</NCM>` +
        `<CFOP>${escapeXml(item.cfop)}</CFOP>` +
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

    return {
        xml: `<det nItem="${nItem}">${prodXml}${impostoXml}</det>`,
        vProd,
    };
}

function buildInfNFeXml(params: BuildDevolucaoNfeParams, chaveAcesso: string): string {
    const { store, fornecedor, refChaveAcesso, serie, numero, tpAmb, motivo, itens } = params;
    const dataEmissao = params.dataEmissao || new Date();
    const cUF = ufToCode(store.uf);
    const cnpjEmit = store.cnpj.replace(/\D/g, '');
    const cnpjDest = fornecedor.cnpj.replace(/\D/g, '');

    const detsBuilt = itens.map((item, index) => buildDetXml(item, index + 1, store.crt));
    const detsXml = detsBuilt.map((d) => d.xml).join('');
    const vProdTotal = round2(detsBuilt.reduce((sum, d) => sum + d.vProd, 0));

    // Mesmo campo obrigatório que faltava no builder de Perda — cNF tem
    // que bater com o número embutido na chave de acesso, senão a Sefaz
    // rejeita o lote inteiro por falha de schema.
    const cNF = chaveAcesso.slice(35, 43);

    const ideXml =
        `<ide>` +
        `<cUF>${cUF}</cUF>` +
        `<cNF>${cNF}</cNF>` +
        `<natOp>${escapeXml('Devolução de compra')}</natOp>` +
        `<mod>55</mod>` +
        `<serie>${serie}</serie>` +
        `<nNF>${numero}</nNF>` +
        `<dhEmi>${formatDhEventoBrasilia(dataEmissao)}</dhEmi>` +
        `<tpNF>0</tpNF>` +
        `<idDest>${fornecedor.uf && fornecedor.uf !== store.uf ? 2 : 1}</idDest>` +
        `<cMunFG>${escapeXml(store.codigoMunicipioIbge || '')}</cMunFG>` +
        `<tpImp>1</tpImp>` +
        `<tpEmis>1</tpEmis>` +
        `<cDV>${chaveAcesso.slice(-1)}</cDV>` +
        `<tpAmb>${tpAmb}</tpAmb>` +
        `<finNFe>4</finNFe>` +
        `<indFinal>0</indFinal>` +
        `<indPres>9</indPres>` +
        `<indIntermed>0</indIntermed>` +
        `<procEmi>0</procEmi>` +
        `<verProc>GestIA 1.0</verProc>` +
        `<NFref><refNFe>${escapeXml(refChaveAcesso)}</refNFe></NFref>` +
        `</ide>`;

    const emitXml =
        `<emit>` +
        `<CNPJ>${cnpjEmit}</CNPJ>` +
        `<xNome>${escapeXml(store.nome)}</xNome>` +
        buildEnderecoXml('enderEmit', store) +
        (store.inscricaoEstadual
            ? `<IE>${escapeXml(store.inscricaoEstadual.replace(/\D/g, ''))}</IE>`
            : `<IE>ISENTO</IE>`) +
        `<CRT>${store.crt}</CRT>` +
        `</emit>`;

    const indIEDest = fornecedor.inscricaoEstadual ? '1' : '9';

    // Mesma exigência da Sefaz em homologação que existe no builder de
    // Perda: com tpAmb=2 o xNome do destinatário TEM que ser esse texto
    // literal, senão rejeita com cStat 598 — não importa quem seja o
    // fornecedor de verdade.
    const xNomeDest =
        tpAmb === 2
            ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
            : fornecedor.nome;

    const destXml =
        `<dest>` +
        `<CNPJ>${cnpjDest}</CNPJ>` +
        `<xNome>${escapeXml(xNomeDest)}</xNome>` +
        buildEnderecoXml('enderDest', fornecedor) +
        `<indIEDest>${indIEDest}</indIEDest>` +
        (fornecedor.inscricaoEstadual
            ? `<IE>${escapeXml(fornecedor.inscricaoEstadual.replace(/\D/g, ''))}</IE>`
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
        `</ICMSTot></total>`;

    // modFrete=9 (sem transporte declarado aqui — quem leva a mercadoria
    // de volta pro fornecedor varia caso a caso, fica em branco por ora).
    const transpXml = `<transp><modFrete>9</modFrete></transp>`;

    // tPag=90 (Sem pagamento) — a devolução normalmente gera crédito ou
    // estorno financeiro tratado à parte (não é uma venda/compra nova).
    const pagXml =
        `<pag><detPag><tPag>90</tPag><vPag>0.00</vPag></detPag></pag>`;

    const infAdicXml =
        `<infAdic><infCpl>${escapeXml(motivo)}</infCpl></infAdic>`;

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

export function buildAndSignDevolucaoNfe(
    cert: LoadedCertificate,
    params: BuildDevolucaoNfeParams,
): BuiltDevolucaoNfe {
    if (params.itens.length === 0) {
        throw new Error('Selecione ao menos um item pra devolver.');
    }

    if (!params.refChaveAcesso || params.refChaveAcesso.replace(/\D/g, '').length !== 44) {
        throw new Error('Chave de acesso da NF de compra original inválida.');
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
