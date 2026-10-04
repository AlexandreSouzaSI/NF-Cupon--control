import {
    meepItemValue,
    normalizarProdutoChave,
    produtoExcluidoDaAnalise,
} from './meep-item-value.util';

describe('meepItemValue', () => {
    it('usa o total da Meep quando existe, mesmo com quantidade > 1', () => {
        expect(meepItemValue({ total: '30.00', unitValue: '10', quantity: '3' })).toBe(30);
    });

    it('total zero é um total válido (não cai no fallback)', () => {
        expect(meepItemValue({ total: 0, unitValue: 10, quantity: 2 })).toBe(0);
    });

    it('total nulo multiplica valor unitário por quantidade', () => {
        expect(meepItemValue({ total: null, unitValue: '12.5', quantity: '4' })).toBe(50);
    });

    it('aceita Decimal-like (objeto com toString numérico)', () => {
        const decimal = { toString: () => '7.5' };
        expect(meepItemValue({ total: null, unitValue: decimal, quantity: 2 })).toBe(15);
    });

    it('campos ausentes viram 0 em vez de NaN', () => {
        expect(meepItemValue({})).toBe(0);
    });
});

describe('normalizarProdutoChave', () => {
    it('ignora caixa e espaços duplicados', () => {
        expect(normalizarProdutoChave('  Heineken   600ml ')).toBe('HEINEKEN 600ML');
    });
});

describe('produtoExcluidoDaAnalise', () => {
    it('pega taxa de serviço e couvert, mas não produto comum', () => {
        expect(produtoExcluidoDaAnalise('TAXA DE SERVIÇO 10%')).toBe(true);
        expect(produtoExcluidoDaAnalise('COUVERT ARTISTICO')).toBe(true);
        expect(produtoExcluidoDaAnalise('PICANHA')).toBe(false);
    });
});
