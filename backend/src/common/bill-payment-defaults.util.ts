import { BillPaymentMethod, PayableType } from '@prisma/client';

// Deduz type/paymentMethod da Bill a partir do que foi informado no aceite
// rápido de uma NF (entrada ou serviço) — o formulário simplificado não
// pede esses dois campos direto, só PIX ou código de barras (opcional).
export function derivePaymentDefaults(dto: {
    pixKey?: string;
    barcode?: string;
}): { type: PayableType; paymentMethod: BillPaymentMethod } {
    if (dto.barcode?.trim()) {
        return {
            type: PayableType.BOLETO,
            paymentMethod: BillPaymentMethod.BANK_SLIP,
        };
    }

    if (dto.pixKey?.trim()) {
        return {
            type: PayableType.PIX,
            paymentMethod: BillPaymentMethod.PIX,
        };
    }

    return {
        type: PayableType.NO_BILL,
        paymentMethod: BillPaymentMethod.BANK_TRANSFER,
    };
}
