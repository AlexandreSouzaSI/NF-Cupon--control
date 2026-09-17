// Nome padronizado de cada importação: "{Loja} dia XX a YY de mês" — o
// mesmo padrão que os arquivos exportados do PDV já usam (ex: "Anchieta
// dia 21 a 24 de agosto"). Construído a partir de dados reais (nome da
// loja ativa + período informado no import), não do texto solto dentro
// da planilha — assim toda importação fica com o nome no mesmo formato,
// não importa como o arquivo original foi nomeado/exportado.

const MESES_PT = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
];

export function formatarNomePadraoImportacao(
    nomeLoja: string | null | undefined,
    periodoInicio: string | null | undefined,
    periodoFim: string | null | undefined,
    fallback: string,
): string {
    if (!periodoInicio || !periodoFim) return fallback;

    const inicio = new Date(periodoInicio);
    const fim = new Date(periodoFim);

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
        return fallback;
    }

    const diaInicio = String(inicio.getUTCDate()).padStart(2, '0');
    const diaFim = String(fim.getUTCDate()).padStart(2, '0');
    const mesInicio = MESES_PT[inicio.getUTCMonth()];
    const mesFim = MESES_PT[fim.getUTCMonth()];
    const anoInicio = inicio.getUTCFullYear();
    const anoFim = fim.getUTCFullYear();

    const prefixo = nomeLoja ? `${nomeLoja} dia ` : 'Dia ';

    if (anoInicio !== anoFim) {
        return `${prefixo}${diaInicio} de ${mesInicio} de ${anoInicio} a ${diaFim} de ${mesFim} de ${anoFim}`;
    }

    if (mesInicio !== mesFim) {
        return `${prefixo}${diaInicio} de ${mesInicio} a ${diaFim} de ${mesFim}`;
    }

    return `${prefixo}${diaInicio} a ${diaFim} de ${mesInicio}`;
}
