import { describe, expect, it } from 'vitest';

import { parseBoletoCode } from './boleto';

// Fixtures construídas replicando o mesmo algoritmo do parser (mod10 nos 3
// primeiros blocos da linha digitável, mod11 no DV geral do código de
// barras) — não são boletos reais, mas os dígitos verificadores batem, o
// que é o que o parser realmente checa.
const VALID_BARCODE = '34199110000000123451234567890123456789012345'.slice(0, 44);
const VALID_LINHA = '34191234546789012345767890123457911000000012345';

describe('parseBoletoCode', () => {
    it('decodifica código de barras (44 dígitos) com valor, vencimento e DV ok', () => {
        const result = parseBoletoCode(VALID_BARCODE);

        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;

        expect(result.data.bankCode).toBe('341');
        expect(result.data.value).toBeCloseTo(123.45, 2);
        expect(result.data.dueDate).toBe('2025-06-02');
        expect(result.data.checkDigitsOk).toBe(true);
        expect(result.data.sourceFormat).toBe('barcode');
    });

    it('decodifica linha digitável (47 dígitos) com valor, vencimento e DV ok', () => {
        const result = parseBoletoCode(VALID_LINHA);

        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;

        expect(result.data.bankCode).toBe('341');
        expect(result.data.value).toBeCloseTo(123.45, 2);
        expect(result.data.dueDate).toBe('2025-06-02');
        expect(result.data.checkDigitsOk).toBe(true);
        expect(result.data.sourceFormat).toBe('linha_digitavel');
    });

    it('aceita a linha digitável com espaços/pontos (normaliza pra só dígitos)', () => {
        const formatted =
            VALID_LINHA.slice(0, 5) +
            '.' +
            VALID_LINHA.slice(5, 10) +
            ' ' +
            VALID_LINHA.slice(10);

        const result = parseBoletoCode(formatted);

        expect(result.status).toBe('ok');
    });

    it('detecta dígito verificador inválido no código de barras', () => {
        const corrupted =
            VALID_BARCODE.slice(0, 4) +
            (VALID_BARCODE[4] === '9' ? '0' : '9') +
            VALID_BARCODE.slice(5);

        const result = parseBoletoCode(corrupted);

        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;

        expect(result.data.checkDigitsOk).toBe(false);
    });

    it('detecta dígito verificador inválido na linha digitável', () => {
        // Corrompe o DV do primeiro bloco (índice 9 do field1).
        const corrupted =
            VALID_LINHA.slice(0, 9) +
            (VALID_LINHA[9] === '9' ? '0' : '9') +
            VALID_LINHA.slice(10);

        const result = parseBoletoCode(corrupted);

        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;

        expect(result.data.checkDigitsOk).toBe(false);
    });

    it('zera o valor quando o campo de valor vem todo zerado', () => {
        const zeroValueBarcode =
            VALID_BARCODE.slice(0, 9) + '0000000000' + VALID_BARCODE.slice(19);

        const result = parseBoletoCode(zeroValueBarcode);

        expect(result.status).toBe('ok');
        if (result.status !== 'ok') return;

        // value <= 0 vira null (campo de valor não confiável, ex. boleto
        // sem valor fixo) — não faz sentido pré-preencher R$ 0,00.
        expect(result.data.value).toBeNull();
    });

    it('marca código de convênio/concessionária (48 dígitos) como não suportado', () => {
        const result = parseBoletoCode('1'.repeat(48));

        expect(result.status).toBe('unsupported');
    });

    it('devolve "incomplete" enquanto o total de dígitos não bate com nenhum formato', () => {
        expect(parseBoletoCode('123').status).toBe('incomplete');
        expect(parseBoletoCode('1'.repeat(30)).status).toBe('incomplete');
    });

    it('ignora tudo que não é dígito ao contar o tamanho', () => {
        // 44 dígitos de verdade, cercados de texto — não deve virar 47 nem
        // contar caracteres não-numéricos.
        const result = parseBoletoCode(`Código: ${VALID_BARCODE} (bipado)`);

        expect(result.status).toBe('ok');
    });
});
