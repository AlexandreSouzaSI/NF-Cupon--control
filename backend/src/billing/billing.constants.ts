// Dias liberados por pagamento confirmado (cobrança mensal recorrente).
export const PERIOD_DAYS = 30;

// Tolerância depois do fim do período antes de bloquear os módulos pagos —
// cobre boleto/Pix que compensa com atraso e o intervalo até o Asaas
// gerar/avisar a cobrança seguinte.
export const GRACE_DAYS = 3;

// Status de cobrança do Asaas que contam como "dinheiro entrou".
export const PAID_PAYMENT_STATUSES = new Set([
    'RECEIVED',
    'CONFIRMED',
    'RECEIVED_IN_CASH',
]);

// Empresa guarda-chuva das contas de teste grátis (ver demo.service.ts) —
// nunca é cliente, não entra na visão de assinaturas.
export const DEMO_EMPRESA_ID = 'empresa-demo';

export const DAY_MS = 24 * 60 * 60 * 1000;
