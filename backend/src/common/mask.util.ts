// Mascara e-mail/telefone pra mostrar na tela de "esqueci minha senha" — a
// pessoa precisa reconhecer qual é o contato dela sem o valor completo
// ficar visível pra quem só está olhando por cima do ombro.

// "alexandresouza33@gmail.com" -> "ale*************33@gmail.com"
export function maskEmail(email: string): string {
    const [local, domain] = email.split('@');

    if (!domain || local.length <= 5) {
        // Local muito curto pra esconder de verdade — mascara tudo menos
        // o primeiro caractere, só pra não expor à toa.
        return `${local[0] ?? ''}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain ?? ''}`;
    }

    const start = local.slice(0, 3);
    const end = local.slice(-2);
    const stars = '*'.repeat(local.length - start.length - end.length);

    return `${start}${stars}${end}@${domain}`;
}

// "5531975805400" -> "319*****5400" (mostra DDD+1º dígito e os 4 últimos,
// esconde o miolo — funciona tanto com DDI 55 quanto sem, já que o normal
// é o telefone já vir normalizado antes de chegar aqui).
export function maskPhone(phoneNormalized: string): string {
    // Tira o DDI 55 só pra exibição — fica mais reconhecível pra pessoa
    // (ela não digita o 55 no dia a dia).
    const digits = phoneNormalized.startsWith('55')
        ? phoneNormalized.slice(2)
        : phoneNormalized;

    if (digits.length <= 7) {
        return `${digits.slice(0, 2)}${'*'.repeat(Math.max(digits.length - 2, 1))}`;
    }

    const start = digits.slice(0, 3);
    const end = digits.slice(-4);
    const stars = '*'.repeat(digits.length - start.length - end.length);

    return `${start}${stars}${end}`;
}
