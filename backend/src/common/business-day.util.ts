// "Dia comercial" compartilhado por Meep (itens/dia, impostos,
// conciliação) e pelo bridge que alimenta Venda/Lista a partir da Meep
// (ver meep-product-sales-sync.service.ts): o bar não fecha na virada
// do dia (abre 11h-16h, vai até 1h-4h da madrugada seguinte), então
// "dia" aqui não é 00h-00h de calendário, é 08h de um dia até 04h do
// dia seguinte, horário de Brasília (UTC-3, fixo, sem horário de
// verão desde 2019). Uma venda feita às 01h ainda é do dia comercial
// de ontem. Extraído de MeepQueryService pra não duplicar a regra
// numa segunda cópia.
const BRT_OFFSET_HOURS = 3;
const BUSINESS_DAY_START_HOUR = 8; // BRT
const BUSINESS_DAY_END_HOUR = 4; // BRT (madrugada do dia seguinte)

// Agrupa uma data UTC no dia comercial a que ela pertence (string
// YYYY-MM-DD).
export function businessDayKey(utcDate: Date): string {
    const brt = new Date(utcDate.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
    if (brt.getUTCHours() < BUSINESS_DAY_START_HOUR) {
        brt.setUTCDate(brt.getUTCDate() - 1);
    }
    return brt.toISOString().slice(0, 10);
}

// Início do dia comercial (08h BRT) de uma data YYYY-MM-DD, em UTC.
export function businessDayStartUtc(dateStr: string): Date {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCHours(d.getUTCHours() + BUSINESS_DAY_START_HOUR + BRT_OFFSET_HOURS);
    return d;
}

// Fim do dia comercial (04h BRT do dia seguinte) de uma data
// YYYY-MM-DD, em UTC.
export function businessDayEndUtc(dateStr: string): Date {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(BUSINESS_DAY_END_HOUR + BRT_OFFSET_HOURS);
    d.setUTCMilliseconds(-1);
    return d;
}

// Lista (em ordem) todas as chaves de dia comercial que se sobrepõem ao
// intervalo [from, to] — usado pra saber quais dias precisam ser
// recalculados depois de um sync incremental que pode cobrir mais de
// um dia comercial.
export function businessDayKeysInRange(from: Date, to: Date): string[] {
    if (to.getTime() < from.getTime()) return [];

    const keys: string[] = [];
    let cursor = new Date(from.getTime());

    // Cada dia comercial dura 20h (08h-04h) — avançar 20h por vez nunca
    // pula um dia comercial inteiro.
    const STEP_MS = 20 * 60 * 60 * 1000;

    while (cursor.getTime() <= to.getTime()) {
        const key = businessDayKey(cursor);
        if (keys[keys.length - 1] !== key) keys.push(key);
        cursor = new Date(cursor.getTime() + STEP_MS);
    }

    const lastKey = businessDayKey(to);
    if (keys[keys.length - 1] !== lastKey) keys.push(lastKey);

    return keys;
}
