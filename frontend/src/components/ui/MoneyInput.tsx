'use client';

import type { InputHTMLAttributes } from 'react';

// =============================================================================
// Campo de dinheiro formatado em reais: mostra "9.319,59" enquanto digita
// (estilo app de banco — os números entram pela direita: 9 → 0,09 → 0,93...).
//
// Troca direto um <input>: mesmo onChange(e) com e.target.value. O valor que
// sai no onChange é sem separador de milhar:
//   formato "ponto" (padrão): "9319.59" — pra quem faz Number(valor) ou
//                              valor.replace(',', '.')
//   formato "virgula":        "9319,59" — pra quem tira os pontos e troca a
//                              vírgula (valor.replace(/\./g, '').replace(',', '.'))
// Campo vazio sai "".
// =============================================================================

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: string | number | null | undefined;
    onChange?: (e: { target: { value: string } }) => void;
    formato?: 'ponto' | 'virgula';
    // Aceita valor negativo (tecla "-" troca o sinal).
    negativo?: boolean;
};

// Lê "9319.59", "9319,59", "9.319,59", "R$ 9.319,59" ou número.
export function lerValorMonetario(valor: string | number | null | undefined): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    let s = String(valor).replace(/R\$/g, '').replace(/\s/g, '');
    if (!s) return null;
    const neg = s.startsWith('-');
    s = s.replace(/-/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return neg ? -n : n;
}

export function formatarValorMonetario(n: number) {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MoneyInput({ value, onChange, formato = 'ponto', negativo = false, className, onFocus, onKeyDown, onPaste, ...resto }: Props) {
    const n = lerValorMonetario(value);
    const mostrado = n === null ? '' : formatarValorMonetario(n);

    const emitir = (num: number | null) => {
        if (!onChange) return;
        if (num === null) return onChange({ target: { value: '' } });
        const texto = num.toFixed(2);
        onChange({ target: { value: formato === 'virgula' ? texto.replace('.', ',') : texto } });
    };

    return (
        <input
            {...resto}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={mostrado}
            className={className}
            onFocus={(e) => {
                // Seleciona tudo: dá pra digitar o valor novo direto.
                e.target.select();
                onFocus?.(e);
            }}
            onKeyDown={(e) => {
                if (negativo && e.key === '-') {
                    e.preventDefault();
                    if (n !== null) emitir(-n);
                }
                onKeyDown?.(e);
            }}
            onPaste={(e) => {
                // Colar "1.234,56" / "1234.56" / "R$ 1.234,56": usa o valor como está.
                const colado = lerValorMonetario(e.clipboardData.getData('text'));
                if (colado !== null) {
                    e.preventDefault();
                    emitir(negativo ? colado : Math.abs(colado));
                }
                onPaste?.(e);
            }}
            onChange={(e) => {
                const digitos = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                if (!digitos) return emitir(null);
                const centavos = Number(digitos.slice(0, 15));
                const sinal = negativo && (n ?? 0) < 0 ? -1 : 1;
                emitir((sinal * centavos) / 100);
            }}
        />
    );
}
