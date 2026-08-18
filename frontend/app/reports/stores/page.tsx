'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Relatório de Lojas virou uma aba dentro de Relatórios.
export default function StoresReportRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/reports?tab=lojas');
    }, [router]);

    return null;
}
