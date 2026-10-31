// Tipos e contas da Conciliação do Extrato (tela interna e link público).

export type Parte = { k: string; v: number };
export type ItemExtrato = {
    id: string;
    ordem: number;
    data: string;
    hora?: string | null;
    tipo: string;
    nome: string;
    descricao: string;
    valor: number;
    partes: Parte[];
    origem?: string | null;
    motivo?: string | null;
    sugestao?: string | null;
    nota?: string | null;
    billId?: string | null; // já existe em Contas a Pagar: não cria outra
};
export type CategoriaOpcao = { id: string; name: string; group?: string | null };

export const FIXOS: Record<string, { nome: string; curto: string; tecla: string; cor: string }> = {
    NAO: { nome: 'Não é despesa (transferência, aplicação...)', curto: 'Não é despesa', tecla: 'N', cor: 'bg-gray-400 text-white border-gray-400' },
    JA_LANCADO: { nome: 'Já lançado em Contas a Pagar', curto: 'Já lançado', tecla: 'J', cor: 'bg-emerald-600 text-white border-emerald-600' },
};

export const moeda = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmt = (v: number) => v.toFixed(2).replace('.', ',');
export const num = (t: string) => {
    const s = String(t ?? '').trim();
    if (!s) return 0;
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return Number.isFinite(n) ? n : 0;
};
export const cent = (v: number) => Math.round(v * 100);
export const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export const dataBR = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
export const TIPO: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência', TARIFA: 'Tarifa', DEBITO: 'Débito automático', OUTRO: 'Outro' };

export const nomeMes = (mes: string) => {
    const [a, m] = mes.split('-').map(Number);
    const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
};

export function totaisExtrato(itens: ItemExtrato[]) {
    const por: Record<string, { tot: number; n: number }> = {};
    let feito = 0, vFeito = 0, total = 0;
    for (const it of itens) {
        total += cent(it.valor);
        if (!it.partes.length) continue;
        feito++; vFeito += cent(it.valor);
        for (const p of it.partes) {
            const o = (por[p.k] ??= { tot: 0, n: 0 });
            o.tot += cent(p.v); o.n++;
        }
    }
    for (const k of Object.keys(por)) por[k].tot /= 100;
    return { por, feito, vFeito: vFeito / 100, total: total / 100, pendente: (total - vFeito) / 100, nPend: itens.length - feito };
}
