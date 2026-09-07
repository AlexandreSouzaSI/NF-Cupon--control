// Normaliza um telefone pra só dígitos com DDI 55 na frente — cobre os
// formatos mais comuns que alguém digitaria no cadastro: "(31) 99999-8888",
// "31999998888", "5531999998888", "+55 31 99999-8888". Usado tanto na
// escrita (users.service.ts, pra sempre gravar no mesmo formato e o
// @unique funcionar de verdade) quanto no envio/leitura de WhatsApp
// (whatsapp.service.ts).
export function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');

    if (digits.startsWith('55') && digits.length >= 12) {
        return digits;
    }

    return `55${digits}`;
}
