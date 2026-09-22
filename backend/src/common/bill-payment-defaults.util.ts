import { BillPaymentMethod, PayableType } from '@prisma/client';

// Deduz type/paymentMethod da Bill a partir do que foi informado no aceite
// rápido de uma NF (entrada ou serviço) — o formulário simplificado não
// pede esses dois campos direto, só PIX ou código de barras (opcional).
//
// paymentType, quando informado, tem prioridade sobre a inferência por
// conteúdo — necessário pro caso de "Boleto, código ainda não chegou":
// sem esse campo, barcode vazio e pixKey vazio caía sempre em NO_BILL,
// classificando errado uma escolha explícita de Boleto pendente como "sem
// boleto". Quem não manda paymentType continua com o comportamento antigo
// (inferido só pelo conteúdo), pra não quebrar quem já chama essa função.
export function derivePaymentDefaults(dto: {
    pixKey?: string;
    barcode?: string;
    paymentType?: 'PIX' | 'BOLETO' | 'NONE';
}): { type: PayableType; paymentMethod: BillPaymentMethod } {
    if (dto.paymentType === 'BOLETO') {
        return {
            type: PayableType.BOLETO,
            paymentMethod: BillPaymentMethod.BANK_SLIP,
        };
    }

    if (dto.paymentType === 'PIX') {
        return {
            type: PayableType.PIX,
            paymentMethod: BillPaymentMethod.PIX,
        };
    }

    if (dto.paymentType === 'NONE') {
        return {
            type: PayableType.NO_BILL,
            paymentMethod: BillPaymentMethod.BANK_TRANSFER,
        };
    }

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
