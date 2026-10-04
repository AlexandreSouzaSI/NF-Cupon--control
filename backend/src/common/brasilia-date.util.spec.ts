import { brasiliaDueDateRanges } from './brasilia-date.util';

describe('brasiliaDueDateRanges', () => {
    it('usa a data de Brasília, não a do servidor em UTC', () => {
        // 02h UTC de 11/out = 23h de 10/out em Brasília.
        const r = brasiliaDueDateRanges(new Date('2026-10-11T02:00:00Z'));

        expect(r.todayStart.toISOString()).toBe('2026-10-10T00:00:00.000Z');
        expect(r.tomorrowStart.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    });

    it('semana = hoje + 6 dias e mês termina no dia 1 seguinte', () => {
        const r = brasiliaDueDateRanges(new Date('2026-10-28T15:00:00Z'));

        expect(r.weekEnd.toISOString()).toBe('2026-11-04T00:00:00.000Z');
        expect(r.monthEnd.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    });

    it('vencimento gravado ao meio-dia UTC cai no dia certo', () => {
        const r = brasiliaDueDateRanges(new Date('2026-10-10T15:00:00Z'));
        const due = new Date('2026-10-10T12:00:00.000Z');

        expect(due >= r.todayStart && due < r.tomorrowStart).toBe(true);
    });
});
