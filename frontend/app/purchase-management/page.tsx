'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Essa tela era um fluxo antigo de recebimento de compras (usava o
// endpoint /purchases/:id/check, que fazia um "marcar como recebido"
// simplificado sem conferência de itens/divergência). Não tinha mais
// nenhum link/menu apontando pra ela — sobrou de uma versão anterior do
// fluxo de Compras. O recebimento de verdade hoje é feito na tela de
// detalhe da compra (/purchases/[id]), que já registra divergência item a
// item. Removido o endpoint /check do backend por ser redundante e
// arriscado (deixava a compra "recebida" sem passar pela conferência real).
// Mantendo essa rota como redirect (em vez de apagar o arquivo) pra
// qualquer link/favorito antigo continuar funcionando, só que levando pro
// lugar certo.
export default function PurchaseManagementRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/purchases');
    }, [router]);

    return null;
}
