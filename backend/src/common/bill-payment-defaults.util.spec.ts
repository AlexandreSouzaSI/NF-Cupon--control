import { BillPaymentMethod, PayableType } from '@prisma/client';
import { derivePaymentDefaults } from './bill-payment-defaults.util';

// Essa função decide, no aceite rápido de uma NF, se a conta gerada é
// Boleto/PIX/Sem boleto — errar aqui manda a conta pro fluxo de
// pagamento errado (ex: cobrar boleto de algo que é PIX). paymentType
// explícito tem prioridade sobre a inferência por conteúdo (ver
// comentário no arquivo original — resolve o caso "Boleto, código ainda
// não chegou").
describe('derivePaymentDefaults', () => {
    it('paymentType=BOLETO força Boleto mesmo sem barcode preenchido', () => {
        expect(
            derivePaymentDefaults({ paymentType: 'BOLETO' }),
        ).toEqual({
            type: PayableType.BOLETO,
            paymentMethod: BillPaymentMethod.BANK_SLIP,
        });
    });

    it('paymentType=PIX força PIX mesmo com barcode preenchido por engano', () => {
        expect(
            derivePaymentDefaults({
                paymentType: 'PIX',
                barcode: '00190500954014481606906809350314337370000000100',
            }),
        ).toEqual({
            type: PayableType.PIX,
            paymentMethod: BillPaymentMethod.PIX,
        });
    });

    it('paymentType=NONE força Sem boleto', () => {
        expect(
            derivePaymentDefaults({ paymentType: 'NONE' }),
        ).toEqual({
            type: PayableType.NO_BILL,
            paymentMethod: BillPaymentMethod.BANK_TRANSFER,
        });
    });

    it('sem paymentType, infere Boleto pelo barcode preenchido', () => {
        expect(
            derivePaymentDefaults({
                barcode: '00190500954014481606906809350314337370000000100',
            }),
        ).toEqual({
            type: PayableType.BOLETO,
            paymentMethod: BillPaymentMethod.BANK_SLIP,
        });
    });

    it('sem paymentType e sem barcode, infere PIX pela chave preenchida', () => {
        expect(
            derivePaymentDefaults({ pixKey: '11999999999' }),
        ).toEqual({
            type: PayableType.PIX,
            paymentMethod: BillPaymentMethod.PIX,
        });
    });

    it('barcode só com espaços em branco não conta como preenchido', () => {
        expect(
            derivePaymentDefaults({ barcode: '   ', pixKey: 'chave@pix.com' }),
        ).toEqual({
            type: PayableType.PIX,
            paymentMethod: BillPaymentMethod.PIX,
        });
    });

    it('sem nenhum dado, cai em Sem boleto', () => {
        expect(derivePaymentDefaults({})).toEqual({
            type: PayableType.NO_BILL,
            paymentMethod: BillPaymentMethod.BANK_TRANSFER,
        });
    });
});
