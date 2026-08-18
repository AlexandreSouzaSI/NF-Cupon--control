'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Relatório por Cartão virou uma aba dentro de Relatórios.
export default function CardsReportRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/reports?tab=cartoes');
    }, [router]);

    return null;
}
