'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Cartões virou uma aba dentro de Cadastros.
export default function CardsRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/cadastros?tab=cartoes');
    }, [router]);

    return null;
}
