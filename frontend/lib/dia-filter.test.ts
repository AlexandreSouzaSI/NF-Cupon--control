import { describe, it, expect } from 'vitest';
import { hojeLocalISO, somarDias } from './dia-filter';

describe('somarDias', () => {
    it('avança e recua um dia', () => {
        expect(somarDias('2026-10-02', 1)).toBe('2026-10-03');
        expect(somarDias('2026-10-02', -1)).toBe('2026-10-01');
    });

    it('atravessa virada de mês e de ano', () => {
        expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
        expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('data inválida volta como veio', () => {
        expect(somarDias('', 1)).toBe('');
    });
});

describe('hojeLocalISO', () => {
    it('usa o calendário local, com zero à esquerda', () => {
        expect(hojeLocalISO(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    });
});
