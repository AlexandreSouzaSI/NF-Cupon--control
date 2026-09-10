// Tabela de correspondência entre o CFOP da compra original (entrada) e o
// CFOP da devolução (saída) — Convênio SINIEF s/n 1970, Ajuste SINIEF
// 07/2001 e tabela de CFOPs do CONFAZ. Cobre os casos mais comuns de
// compra de mercadoria pra comercialização/industrialização, uso e
// consumo, ativo imobilizado e substituição tributária, dentro e fora do
// estado.
//
// Quando o CFOP da compra original não estiver aqui, NÃO adivinhe — a
// tela pede pro usuário informar o CFOP de devolução manualmente antes de
// gerar a NF (ver DevolucoesController/Service). O mapa já cobre tanto o
// CFOP "dentro do estado" (1xxx → 5xxx) quanto "fora do estado" (2xxx →
// 6xxx) como entradas separadas, pra não depender de troca automática de
// dígito (alguns CFOPs não seguem esse padrão 1:1).
export const CFOP_DEVOLUCAO_MAP: Record<string, string> = {
    // Compra pra industrialização/produção rural
    '1101': '5201',
    '2101': '6201',
    // Compra pra comercialização
    '1102': '5202',
    '2102': '6202',
    // Compra pra industrialização de mercadoria recebida de terceiros
    '1113': '5209',
    '2113': '6209',
    // Compra de mercadoria sujeita a substituição tributária (comercialização)
    '1403': '5411',
    '2403': '6411',
    // Compra de matéria-prima/material de embalagem sujeita a ST
    '1401': '5401',
    '2401': '6401',
    // Compra de material de uso ou consumo
    '1556': '5556',
    '2556': '6556',
    // Compra de bem para o ativo imobilizado
    '1551': '5553',
    '2551': '6553',
    // Compra de energia elétrica / serviço — não costuma ter devolução,
    // mas mapeado por completude
    '1252': '5202',
    // Transferência de mercadoria recebida (entre lojas/filiais)
    '1152': '5202',
    '2152': '6202',
};

// Devolve o CFOP sugerido pra devolução a partir do CFOP de compra
// original, ou null se não houver mapeamento conhecido (nesse caso o
// chamador deve pedir o CFOP manualmente, nunca inventar um valor).
export function sugerirCfopDevolucao(cfopOrigem: string): string | null {
    const cfop = (cfopOrigem || '').trim();

    if (CFOP_DEVOLUCAO_MAP[cfop]) {
        return CFOP_DEVOLUCAO_MAP[cfop];
    }

    return null;
}
