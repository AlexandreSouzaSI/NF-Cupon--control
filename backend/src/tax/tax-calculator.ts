// Motor de cálculo de tributos — Simples Nacional (Anexo I) e Lucro
// Presumido. Todas as alíquotas específicas da loja vêm de TaxRegimeConfig
// (configurável, nunca fixas aqui) — só ficam fixas neste arquivo as regras
// que são lei federal/estadual estável, com a fonte anotada em comentário.
//
// AVISO: isso é uma estimativa gerencial construída a partir de pesquisa
// pública (ago/2026). Não substitui a apuração oficial feita pelo contador
// — principalmente porque a classificação do Presumido (comércio 8% vs
// serviço 32%) e o enquadramento do regime especial de ICMS em MG dependem
// de decisões cadastrais que só o contador confirma com segurança.

export type SimplesAnexoIFaixa = {
    faixa: number;
    ate: number; // limite superior da faixa (RBT12)
    aliquotaNominal: number; // ex: 0.04 = 4%
    parcelaDeduzir: number;
};

// Fonte: Lei Complementar 123/2006 c/ atualizações, tabela vigente 2026 —
// conferida via Portal do Simples Nacional / CGSN em ago/2026. Restaurantes,
// bares e lanchonetes com preparo próprio se enquadram no Anexo I
// (comércio).
export const SIMPLES_ANEXO_I: SimplesAnexoIFaixa[] = [
    { faixa: 1, ate: 180_000, aliquotaNominal: 0.04, parcelaDeduzir: 0 },
    { faixa: 2, ate: 360_000, aliquotaNominal: 0.073, parcelaDeduzir: 5_940 },
    { faixa: 3, ate: 720_000, aliquotaNominal: 0.095, parcelaDeduzir: 13_860 },
    { faixa: 4, ate: 1_800_000, aliquotaNominal: 0.107, parcelaDeduzir: 22_500 },
    { faixa: 5, ate: 3_600_000, aliquotaNominal: 0.143, parcelaDeduzir: 87_300 },
    { faixa: 6, ate: 4_800_000, aliquotaNominal: 0.19, parcelaDeduzir: 378_000 },
];

export type SimplesResult = {
    faixa: number;
    aliquotaNominal: number;
    parcelaDeduzir: number;
    aliquotaEfetiva: number;
    dasValue: number;
    excedeuLimite: boolean;
    limiteFaixaAtual: number; // teto de RBT12 da faixa atual
    faltaParaProximaFaixa: number | null; // null se já está na última faixa
    proximaAliquotaNominal: number | null;
};

// Fórmula oficial: alíquota efetiva = ((RBT12 × alíquota nominal) − parcela
// a deduzir) ÷ RBT12. O DAS do mês é a receita do mês × alíquota efetiva.
export function calculateSimplesNacional(
    rbt12: number,
    monthRevenue: number,
): SimplesResult {
    const excedeuLimite = rbt12 > 4_800_000;

    const faixaConfig =
        SIMPLES_ANEXO_I.find((f) => rbt12 <= f.ate) ||
        SIMPLES_ANEXO_I[SIMPLES_ANEXO_I.length - 1];

    const nextFaixaConfig = !excedeuLimite
        ? SIMPLES_ANEXO_I.find((f) => f.faixa === faixaConfig.faixa + 1)
        : undefined;

    if (rbt12 <= 0) {
        return {
            faixa: 1,
            aliquotaNominal: SIMPLES_ANEXO_I[0].aliquotaNominal,
            parcelaDeduzir: 0,
            aliquotaEfetiva: SIMPLES_ANEXO_I[0].aliquotaNominal,
            dasValue: monthRevenue * SIMPLES_ANEXO_I[0].aliquotaNominal,
            excedeuLimite: false,
            limiteFaixaAtual: SIMPLES_ANEXO_I[0].ate,
            faltaParaProximaFaixa: SIMPLES_ANEXO_I[0].ate,
            proximaAliquotaNominal: SIMPLES_ANEXO_I[1]?.aliquotaNominal ?? null,
        };
    }

    const aliquotaEfetivaBruta =
        (rbt12 * faixaConfig.aliquotaNominal - faixaConfig.parcelaDeduzir) /
        rbt12;

    // Nunca deixa a alíquota efetiva ficar negativa (pode acontecer perto
    // da fronteira entre faixas com RBT12 arredondado) nem acima da nominal.
    const aliquotaEfetiva = Math.max(
        0,
        Math.min(aliquotaEfetivaBruta, faixaConfig.aliquotaNominal),
    );

    return {
        faixa: faixaConfig.faixa,
        aliquotaNominal: faixaConfig.aliquotaNominal,
        parcelaDeduzir: faixaConfig.parcelaDeduzir,
        aliquotaEfetiva,
        dasValue: monthRevenue * aliquotaEfetiva,
        excedeuLimite,
        limiteFaixaAtual: faixaConfig.ate,
        faltaParaProximaFaixa: excedeuLimite
            ? null
            : Math.max(0, faixaConfig.ate - rbt12),
        proximaAliquotaNominal: nextFaixaConfig?.aliquotaNominal ?? null,
    };
}

// Limites da lei federal (estáveis, não mudam por configuração de loja):
// adicional de IRPJ de 10% sobre o que exceder R$ 20.000/mês de base de
// cálculo presumida; majoração de 10% no percentual de presunção (2026) pra
// receita trimestral acima de R$ 1.250.000 — aqui aproximada mês a mês
// (R$ 416.666,67/mês) já que o lançamento de faturamento é mensal.
const IRPJ_ADICIONAL_LIMITE_MENSAL = 20_000;
const IRPJ_ADICIONAL_ALIQUOTA = 0.1;
const IRPJ_ALIQUOTA_BASE = 0.15;
const CSLL_ALIQUOTA = 0.09;
const MAJORACAO_LIMITE_MENSAL = 1_250_000 / 3; // aproximação do limite trimestral
const MAJORACAO_ADICIONAL_PERCENTUAL = 1.1; // multiplica o % de presunção por 1,10

export type IcmsConfig = {
    icmsRegimeEspecialMg: boolean;
    icmsAliquotaRefeicao?: number | null; // ex: 3 (%)
    icmsAliquotaOutras?: number | null; // ex: 4 (%) — não usado ainda (ver nota)
    icmsAliquotaPadrao?: number | null; // ex: 18 (%)
};

export type IcmsResult = {
    aliquotaUsada: number;
    debito: number;
    credito: number;
    valor: number; // débito − crédito (ou só débito, no regime especial)
    temCredito: boolean;
};

// No regime especial de MG (bares/restaurantes) a alíquota reduzida já
// substitui o débito/crédito normal — não existe apuração de crédito de
// ICMS nesse caso, o valor é só receita × alíquota fixa. Fora do regime
// especial (alíquota padrão de 18%), o ICMS volta a ser débito−crédito de
// verdade: aproximamos o crédito aplicando a mesma alíquota sobre o custo
// de compras (assumindo que a NF de compra destaca ICMS a essa alíquota —
// simplificação, o crédito real depende do CST/CFOP de cada item).
export function calculateIcms(
    config: IcmsConfig,
    monthRevenue: number,
    monthPurchasesCost: number,
): IcmsResult {
    if (config.icmsRegimeEspecialMg) {
        const aliquotaUsada = Number(config.icmsAliquotaRefeicao || 0);
        const debito = monthRevenue * (aliquotaUsada / 100);

        return {
            aliquotaUsada,
            debito,
            credito: 0,
            valor: debito,
            temCredito: false,
        };
    }

    const aliquotaUsada = Number(config.icmsAliquotaPadrao || 0);
    const debito = monthRevenue * (aliquotaUsada / 100);
    const credito = monthPurchasesCost * (aliquotaUsada / 100);

    return {
        aliquotaUsada,
        debito,
        credito,
        valor: Math.max(0, debito - credito),
        temCredito: true,
    };
}

export type PresumidoConfig = {
    presumidoIrpjPercent: number; // ex: 8 ou 32 (em %, não fração)
    presumidoCsllPercent: number;
    presumidoPisCofinsPercent: number; // ex: 3.65
} & IcmsConfig;

export type PresumidoResult = {
    baseIrpj: number;
    irpj: number;
    irpjAdicional: number;
    baseCsll: number;
    csll: number;
    pisCofins: number;
    pisCofinsCredito: number; // sempre 0 — cumulativo não dá direito a crédito
    icms: number; // líquido (débito − crédito, ou só débito no regime especial)
    icmsDebito: number;
    icmsAliquotaUsada: number;
    icmsCredito: number;
    icmsTemCredito: boolean;
    total: number;
    majoracaoAplicada: boolean;
};

// Simplificação assumida: 100% da receita lançada é tratada como
// "fornecimento de refeições/bebidas" (alíquota reduzida de MG) — se a loja
// tiver receita relevante de "outras operações" (ex: venda de produtos que
// não são refeição), o ideal é lançar isso separado ou ajustar manualmente
// até existir um campo de split de receita.
export function calculateLucroPresumido(
    config: PresumidoConfig,
    monthRevenue: number,
    monthPurchasesCost = 0,
): PresumidoResult {
    const majoracaoAplicada = monthRevenue > MAJORACAO_LIMITE_MENSAL;
    const fatorMajoracao = majoracaoAplicada ? MAJORACAO_ADICIONAL_PERCENTUAL : 1;

    const baseIrpj =
        monthRevenue * (config.presumidoIrpjPercent / 100) * fatorMajoracao;
    const baseCsll =
        monthRevenue * (config.presumidoCsllPercent / 100) * fatorMajoracao;

    const irpj = baseIrpj * IRPJ_ALIQUOTA_BASE;
    const irpjAdicional =
        baseIrpj > IRPJ_ADICIONAL_LIMITE_MENSAL
            ? (baseIrpj - IRPJ_ADICIONAL_LIMITE_MENSAL) * IRPJ_ADICIONAL_ALIQUOTA
            : 0;

    const csll = baseCsll * CSLL_ALIQUOTA;

    // PIS/COFINS cumulativo — não existe apuração de crédito, é direto
    // sobre a receita.
    const pisCofins = monthRevenue * (config.presumidoPisCofinsPercent / 100);

    const icmsResult = calculateIcms(config, monthRevenue, monthPurchasesCost);

    const total = irpj + irpjAdicional + csll + pisCofins + icmsResult.valor;

    return {
        baseIrpj,
        irpj,
        irpjAdicional,
        baseCsll,
        csll,
        pisCofins,
        pisCofinsCredito: 0,
        icms: icmsResult.valor,
        icmsDebito: icmsResult.debito,
        icmsAliquotaUsada: icmsResult.aliquotaUsada,
        icmsCredito: icmsResult.credito,
        icmsTemCredito: icmsResult.temCredito,
        total,
        majoracaoAplicada,
    };
}

// Lucro Real — ESTIMATIVA, não apuração oficial. A apuração de verdade usa
// o lucro contábil (ECF/livro fiscal) com todas as adições e exclusões do
// RIR (depreciação, provisões, multas indedutíveis, compensação de
// prejuízos fiscais de anos anteriores etc.) — nada disso está nesse
// sistema. Aqui a base é só (receita do mês − custo de compras do mês),
// que é a aproximação mais direta que dá pra fazer com os dados que já
// temos (faturamento lançado + compras registradas). Também não modela
// prejuízo fiscal acumulado: se o mês fecha negativo, simplesmente não gera
// IRPJ/CSLL naquele mês (não fica "crédito" pro mês seguinte).
export type RealConfig = {
    realPisCofinsPercent: number; // ex: 9.25
} & IcmsConfig;

export type RealResult = {
    lucroEstimado: number;
    irpj: number;
    irpjAdicional: number;
    csll: number;
    pisCofinsDebito: number;
    pisCofinsCredito: number;
    pisCofins: number; // líquido (débito − crédito)
    icms: number; // líquido (débito − crédito, ou só débito no regime especial)
    icmsDebito: number;
    icmsAliquotaUsada: number;
    icmsCredito: number;
    icmsTemCredito: boolean;
    total: number;
};

export function calculateLucroReal(
    config: RealConfig,
    monthRevenue: number,
    monthPurchasesCost: number,
): RealResult {
    const lucroEstimado = Math.max(0, monthRevenue - monthPurchasesCost);

    const irpj = lucroEstimado * IRPJ_ALIQUOTA_BASE;
    const irpjAdicional =
        lucroEstimado > IRPJ_ADICIONAL_LIMITE_MENSAL
            ? (lucroEstimado - IRPJ_ADICIONAL_LIMITE_MENSAL) *
            IRPJ_ADICIONAL_ALIQUOTA
            : 0;

    const csll = lucroEstimado * CSLL_ALIQUOTA;

    // Não-cumulativo de verdade desconta crédito de PIS/COFINS das compras
    // — simplificamos aplicando a mesma alíquota sobre o custo de compras
    // como "crédito", o que é só uma aproximação (nem toda compra gera
    // crédito integral na regra real).
    const pisCofinsDebito = monthRevenue * (config.realPisCofinsPercent / 100);
    const pisCofinsCredito =
        monthPurchasesCost * (config.realPisCofinsPercent / 100);
    const pisCofins = Math.max(0, pisCofinsDebito - pisCofinsCredito);

    const icmsResult = calculateIcms(config, monthRevenue, monthPurchasesCost);

    const total = irpj + irpjAdicional + csll + pisCofins + icmsResult.valor;

    return {
        lucroEstimado,
        irpj,
        irpjAdicional,
        csll,
        pisCofinsDebito,
        pisCofinsCredito,
        pisCofins,
        icms: icmsResult.valor,
        icmsDebito: icmsResult.debito,
        icmsAliquotaUsada: icmsResult.aliquotaUsada,
        icmsCredito: icmsResult.credito,
        icmsTemCredito: icmsResult.temCredito,
        total,
    };
}
