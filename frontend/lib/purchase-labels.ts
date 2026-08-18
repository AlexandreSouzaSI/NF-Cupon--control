export const purchaseStatusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    PURCHASED: 'Aguardando aprovação',
    PURCHASED: 'Aprovada',
    CANCELED: 'Reprovada',
    PURCHASED: 'Compra realizada',
    WAITING_INVOICE: 'Aguardando nota fiscal',
    HAS_INVOICE: 'Nota fiscal vinculada',
    RECEIVED_OK: 'Conferida',
    CLOSED: 'Fechada',
};

export const paymentMethodLabel: Record<string, string> = {
    CREDIT_CARD: 'Cartão de crédito',
    CASH: 'Dinheiro',
    PIX: 'Pix',
    COMPANY_ACCOUNT: 'Conta da empresa',
};