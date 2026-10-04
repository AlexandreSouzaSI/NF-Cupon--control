import { isBusinessDayBrasilia } from './brasilia-weekday.util';

// Regra: avisos de tarefas só de segunda a sexta, fuso de Brasília (UTC-3).
describe('isBusinessDayBrasilia', () => {
    it('segunda a sexta ao meio-dia são dias úteis', () => {
        // 2026-10-05 é segunda
        for (let day = 5; day <= 9; day++) {
            expect(
                isBusinessDayBrasilia(new Date(`2026-10-0${day}T15:00:00Z`)),
            ).toBe(true);
        }
    });

    it('sábado e domingo não são dias úteis', () => {
        expect(isBusinessDayBrasilia(new Date('2026-10-10T15:00:00Z'))).toBe(false);
        expect(isBusinessDayBrasilia(new Date('2026-10-11T15:00:00Z'))).toBe(false);
    });

    it('usa o fuso de Brasília, não UTC', () => {
        // Sexta 23h em Brasília = sábado 02h UTC -> ainda é dia útil
        expect(isBusinessDayBrasilia(new Date('2026-10-10T02:00:00Z'))).toBe(true);
        // Domingo 22h em Brasília = segunda 01h UTC -> ainda é fim de semana
        expect(isBusinessDayBrasilia(new Date('2026-10-12T01:00:00Z'))).toBe(false);
        // Segunda 00h30 em Brasília = segunda 03h30 UTC -> dia útil
        expect(isBusinessDayBrasilia(new Date('2026-10-12T03:30:00Z'))).toBe(true);
    });
});
