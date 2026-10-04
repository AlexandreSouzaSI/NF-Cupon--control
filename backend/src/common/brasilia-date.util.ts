// Recortes de "dia" no fuso de Brasília (America/Sao_Paulo) para consultas
// por vencimento de Conta a Pagar.
//
// Por que não usar new Date() + getDate(): o servidor roda em UTC, então
// depois das 21h (Brasília) o "hoje" do servidor já é amanhã e a conta que
// vence hoje cairia em "atrasada". Aqui descobrimos a data de calendário
// em Brasília e montamos os limites como meia-noite UTC dessa data, porque
// Bill.dueDate é gravado como `${yyyy-mm-dd}T12:00:00.000Z` (horário
// intermediário, ver bills.service.ts) — ou seja, a data de calendário
// vive no dia UTC, e meia-noite UTC é o limite correto entre dois dias.
const YMD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function brasiliaCalendarDate(now: Date = new Date()) {
    const parts = YMD_FORMATTER.formatToParts(now);
    const get = (type: string) =>
        Number(parts.find((part) => part.type === type)?.value);

    return { year: get('year'), month: get('month'), day: get('day') };
}

export function brasiliaDueDateRanges(now: Date = new Date()) {
    const { year, month, day } = brasiliaCalendarDate(now);

    return {
        todayStart: new Date(Date.UTC(year, month - 1, day)),
        tomorrowStart: new Date(Date.UTC(year, month - 1, day + 1)),
        // "Próximos 7 dias" = hoje + 6 dias, limite exclusivo no 8º dia.
        weekEnd: new Date(Date.UTC(year, month - 1, day + 7)),
        // Restante do mês corrente: de hoje até o fim do mês (exclusivo
        // no dia 1 do mês seguinte).
        monthEnd: new Date(Date.UTC(year, month, 1)),
    };
}
