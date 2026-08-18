'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Lojas virou uma aba dentro de Cadastros.
export default function StoresRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/cadastros?tab=lojas');
    }, [router]);

    return null;
}
