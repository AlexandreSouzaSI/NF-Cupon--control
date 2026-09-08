export const purchaseStatusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida OK',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com diferença',
    WAITING_INVOICE: 'Aguardando NF',
    HAS_COUPON_ONLY: 'Apenas com cupom',
    HAS_INVOICE: 'Com NF',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

export const paymentMethodLabel: Record<string, string> = {
    CREDIT_CARD: 'Cartão de crédito',
    CASH: 'Dinheiro',
    PIX: 'Pix',
    COMPANY_ACCOUNT: 'Conta da empresa',
};