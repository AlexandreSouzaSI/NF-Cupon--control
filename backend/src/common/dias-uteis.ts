// =============================================================================
// Dias úteis (bancários) — conta que vence em sábado, domingo ou feriado pode
// ser paga no próximo dia útil sem juros, então o vencimento é empurrado pra
// ele (e a conta não aparece como vencida no fim de semana/feriado).
//
// Feriados: os nacionais + os dias sem expediente bancário do calendário da
// FEBRABAN (segunda e terça de Carnaval, Sexta-feira Santa, Corpus Christi).
// Feriados municipais/estaduais extras pela variável FERIADOS_EXTRAS do .env,
// separados por vírgula: "dd/mm" (todo ano) ou "dd/mm/aaaa" (só naquele ano).
//   ex.: FERIADOS_EXTRAS=15/08,08/12
// Datas sempre no padrão do sistema: meio-dia UTC (YYYY-MM-DDT12:00:00Z).
// =============================================================================

const DIA = 86_400_000;

// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher).
function pascoa(ano: number): Date {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

const chave = (d: Date) => d.toISOString().slice(0, 10);
const cache = new Map<number, Set<string>>();

export function feriadosDoAno(ano: number): Set<string> {
    const pronto = cache.get(ano);
    if (pronto) return pronto;
    const p = pascoa(ano).getTime();
    const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
    // Dia da Consciência Negra virou feriado nacional a partir de 2024.
    if (ano >= 2024) fixos.push('11-20');
    const lista = new Set<string>(fixos.map((md) => `${ano}-${md}`));
    for (const desloc of [-48, -47, -2, 60]) lista.add(chave(new Date(p + desloc * DIA)));
    for (const item of String(process.env.FERIADOS_EXTRAS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(item);
        if (!m) continue;
        if (m[3] && Number(m[3]) !== ano) continue;
        lista.add(`${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    }
    cache.set(ano, lista);
    return lista;
}

export function ehDiaUtil(data: Date): boolean {
    const d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 12));
    const semana = d.getUTCDay();
    if (semana === 0 || semana === 6) return false;
    return !feriadosDoAno(d.getUTCFullYear()).has(chave(d));
}

// O próprio dia, se for útil; senão o próximo dia útil (meio-dia UTC).
export function proximoDiaUtil(data: Date): Date {
    let d = new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate(), 12));
    for (let i = 0; i < 15 && !ehDiaUtil(d); i++) d = new Date(d.getTime() + DIA);
    return d;
}

// Para gravar numa conta: { dueDate, dueDateOriginal } — o original só fica
// preenchido quando o vencimento foi empurrado.
export function vencimentoUtil(data: Date): { dueDate: Date; dueDateOriginal: Date | null } {
    const util = proximoDiaUtil(data);
    return chave(util) === chave(data) ? { dueDate: data, dueDateOriginal: null } : { dueDate: util, dueDateOriginal: data };
}
