// Estágio OPERACIONAL da compra (Purchase.status) — chegada/recebimento.
// WAITING_INVOICE/HAS_COUPON_ONLY/HAS_INVOICE/WAITING_PAYMENT_REGISTER são
// valores descontinuados do enum (o backend não escreve mais nenhum
// deles — ver comentário em schema.prisma), mantidos aqui só pra não
// quebrar a exibição de alguma linha antiga que ainda tenha um desses
// valores gravados. O estágio fiscal de verdade agora é
// purchaseFiscalStatusLabel, abaixo.
export const purchaseStatusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    WAITING_APPROVAL: 'Aguardando aprovação',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    WAITING_RECEIPT: 'Aguardando recebimento',
    RECEIVED_OK: 'Recebida OK',
    RECEIVED_WITH_DIFFERENCE: 'Recebida com diferença',
    WAITING_INVOICE: 'Aguardando NF (legado)',
    HAS_COUPON_ONLY: 'Apenas com cupom (legado)',
    HAS_INVOICE: 'Com NF (legado)',
    WAITING_PAYMENT_REGISTER: 'Aguardando conta a pagar (legado)',
    CLOSED: 'Fechada',
    CANCELED: 'Cancelada',
};

// Estágio FISCAL da compra (Purchase.fiscalStatus) — nota/cupom anexado,
// independente do estágio operacional acima (ver comentário do enum
// PurchaseFiscalStatus no schema.prisma).
export const purchaseFiscalStatusLabel: Record<string, string> = {
    PENDING: 'Sem documento fiscal',
    COUPON_ONLY: 'Apenas com cupom',
    INVOICE: 'Com nota fiscal',
};

export const paymentMethodLabel: Record<string, string> = {
    CREDIT_CARD: 'Cartão de crédito',
    CASH: 'Dinheiro',
    PIX: 'Pix',
    COMPANY_ACCOUNT: 'Conta da empresa',
};