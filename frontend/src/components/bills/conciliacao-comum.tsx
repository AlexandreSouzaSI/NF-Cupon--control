// Coisas comuns das telas de Conciliação do Extrato.

export type ResumoConciliacao = {
    id: string; storeId: string; lojaNome: string | null; mes: string; banco: string | null; arquivos: string[];
    totalPagamentos: number; nPagamentos: number; status: 'ABERTA' | 'APLICADA'; pendenteReaplicar: boolean;
    aplicadoEm: string | null; linkEnviadoEm: string | null; linkEnviadoPor: string | null; createdAt: string;
    pendentes: number; valorPendente: number;
};

export const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export const erroMsg = (e: any, padrao: string) => {
    const m = e?.response?.data?.message;
    return Array.isArray(m) ? m.join(', ') : m ?? padrao;
};

export function SituacaoConciliacao({ c }: { c: Pick<ResumoConciliacao, 'status' | 'pendenteReaplicar' | 'aplicadoEm' | 'linkEnviadoEm'> }) {
    if (c.status === 'APLICADA' && c.pendenteReaplicar) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Alterada — aplicar de novo</span>;
    if (c.status === 'APLICADA') return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Aplicada{c.aplicadoEm ? ` ${dataHora(c.aplicadoEm)}` : ''}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Em conciliação{c.linkEnviadoEm ? ' · link respondido' : ''}</span>;
}
