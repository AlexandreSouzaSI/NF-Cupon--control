// Leitura automática de boleto bancário (código de barras "bipado" por uma
// leitora, ou linha digitável colada/digitada) — extrai valor e vencimento
// sem precisar de backend, já que é só decodificação do próprio código.
//
// Suporta:
// - Código de barras (44 dígitos), formato normalmente devolvido por
//   leitoras de código de barras USB/Bluetooth (elas digitam os dígitos
//   igual um teclado, na ordem em que aparecem no código de barras).
// - Linha digitável (47 dígitos), pra quando o valor é digitado ou colado
//   manualmente.
//
// Não suporta boletos de convênio/concessionária (48 dígitos — água, luz,
// tributos), que usam outra regra de campos.
//
// Referência: em 22/02/2025 a FEBRABAN reiniciou o "fator de vencimento"
// (que tinha estourado o limite de 4 dígitos, chegando a 9999 nessa data)
// — a contagem recomeçou do zero a partir de 1000, ou seja, fator 1000
// passou a representar 22/02/2025. Como hoje já estamos bem depois dessa
// virada, todo boleto novo usa essa base — não faz sentido tentar decidir
// entre a base antiga (07/10/1997) e a nova pra boletos emitidos agora.
const FEBRABAN_NEW_BASE_MS = Date.UTC(2025, 1, 22); // 22/02/2025 = fator 1000
const FEBRABAN_NEW_BASE_FACTOR = 1000;

function onlyDigits(value: string): string {
    return value.replace(/\D/g, '');
}

// Dígito verificador módulo 10, usado nos 3 primeiros blocos da linha
// digitável.
function mod10(digits: string): number {
    let sum = 0;
    let weight = 2;

    for (let i = digits.length - 1; i >= 0; i--) {
        let product = Number(digits[i]) * weight;

        if (product > 9) {
            product = Math.floor(product / 10) + (product % 10);
        }

        sum += product;
        weight = weight === 2 ? 1 : 2;
    }

    const remainder = sum % 10;

    return remainder === 0 ? 0 : 10 - remainder;
}

// Dígito verificador geral do código de barras, módulo 11 — calculado da
// esquerda pra direita sobre os 43 dígitos de dado (código de barras
// completo menos a própria posição do DV), com pesos fixos que se repetem
// em ciclos de 8 (sequência oficial FEBRABAN, não é 2..9 crescente).
function mod11Barcode(dataDigits: string): number {
    const weights = [4, 3, 2, 9, 8, 7, 6, 5];
    let sum = 0;

    for (let i = 0; i < dataDigits.length; i++) {
        sum += Number(dataDigits[i]) * weights[i % weights.length];
    }

    const remainder = sum % 11;

    if (remainder === 0 || remainder === 1) {
        return 0;
    }

    if (remainder === 10) {
        return 1;
    }

    return 11 - remainder;
}

function factorToDueDate(factor: number): string | null {
    if (!factor) {
        return null;
    }

    const date = new Date(FEBRABAN_NEW_BASE_MS);
    date.setUTCDate(date.getUTCDate() + (factor - FEBRABAN_NEW_BASE_FACTOR));

    return date.toISOString().slice(0, 10);
}

export type ParsedBoleto = {
    bankCode: string;
    value: number | null;
    dueDate: string | null;
    checkDigitsOk: boolean;
    sourceFormat: 'barcode' | 'linha_digitavel';
};

export type ParseBoletoResult =
    | { status: 'ok'; data: ParsedBoleto }
    | { status: 'unsupported'; message: string }
    | { status: 'incomplete' };

// Chama a cada digitação/colagem no campo — só efetivamente decodifica
// quando o total de dígitos bate com um formato conhecido (44 ou 47). Até
// lá, devolve "incomplete" sem erro nenhum, já que o usuário/leitora ainda
// pode estar no meio da digitação.
export function parseBoletoCode(raw: string): ParseBoletoResult {
    const digits = onlyDigits(raw);

    if (digits.length === 44) {
        const bankCode = digits.slice(0, 3);
        const dvGeral = digits[4];
        const factor = Number(digits.slice(5, 9));
        const valueDigits = digits.slice(9, 19);
        const value = Number(valueDigits) / 100;

        const dataDigits = digits.slice(0, 4) + digits.slice(5);
        const expectedDv = mod11Barcode(dataDigits);

        return {
            status: 'ok',
            data: {
                bankCode,
                value: value > 0 ? value : null,
                dueDate: factorToDueDate(factor),
                checkDigitsOk: String(expectedDv) === dvGeral,
                sourceFormat: 'barcode',
            },
        };
    }

    if (digits.length === 47) {
        const field1 = digits.slice(0, 10);
        const field2 = digits.slice(10, 21);
        const field3 = digits.slice(21, 32);
        const field5 = digits.slice(33, 47);

        const dv1Ok = mod10(field1.slice(0, 9)) === Number(field1[9]);
        const dv2Ok = mod10(field2.slice(0, 10)) === Number(field2[10]);
        const dv3Ok = mod10(field3.slice(0, 10)) === Number(field3[10]);

        const bankCode = field1.slice(0, 3);
        const factor = Number(field5.slice(0, 4));
        const value = Number(field5.slice(4, 14)) / 100;

        return {
            status: 'ok',
            data: {
                bankCode,
                value: value > 0 ? value : null,
                dueDate: factorToDueDate(factor),
                checkDigitsOk: dv1Ok && dv2Ok && dv3Ok,
                sourceFormat: 'linha_digitavel',
            },
        };
    }

    if (digits.length === 48) {
        return {
            status: 'unsupported',
            message:
                'Código de concessionária/convênio (água, luz, tributos) não é lido automaticamente — preencha valor e vencimento na mão.',
        };
    }

    return { status: 'incomplete' };
}
