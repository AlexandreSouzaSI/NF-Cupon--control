// Regra única de "dia útil" pra qualquer envio automático/manual ligado a
// Tarefas (WhatsApp, notificações): segunda a sexta no fuso de Brasília.
// Sábado e domingo nada é enviado. Usa America/Sao_Paulo (mesmo fuso dos
// @Cron do projeto) em vez de offset fixo, porque o servidor roda em UTC e
// 23h de sexta em Brasília já é sábado em UTC.
//
// Não confundir com business-day.util.ts, que é o "dia comercial" 08h-04h
// da Meep (outro conceito).
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
});

export function isBusinessDayBrasilia(date: Date = new Date()): boolean {
    const weekday = WEEKDAY_FORMATTER.format(date);

    return weekday !== 'Sat' && weekday !== 'Sun';
}

export const WEEKEND_TASK_MESSAGE =
    'Avisos de tarefas só são enviados de segunda a sexta. Tente novamente na segunda-feira.';
