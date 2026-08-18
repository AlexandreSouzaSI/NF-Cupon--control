'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Usuários virou uma aba dentro de Cadastros.
export default function UsersRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/cadastros?tab=usuarios');
    }, [router]);

    return null;
}
