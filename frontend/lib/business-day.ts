// Espelha isBusinessDayBrasilia do backend (common/brasilia-weekday.util.ts):
// avisos de tarefas só de segunda a sexta, fuso America/Sao_Paulo. Usado só
// pra desabilitar o botão "Notificar WhatsApp" — o backend é quem barra de
// verdade.
export function isBusinessDayBrasilia(date: Date = new Date()): boolean {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
    }).format(date);

    return weekday !== 'Sat' && weekday !== 'Sun';
}
