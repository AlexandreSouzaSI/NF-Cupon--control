'use client';

import Link from 'next/link';

import { useBillingStatus } from '@/lib/billing';

// Link "Conhecer os planos" reaproveitado na landing (header, hero...).
// Some sozinho pra empresa isenta (Nugalho) e Admin Master — ver
// useBillingStatus. Enquanto não sabe, não renderiza nada (evita piscar).
export function PlansCtaLink({
    className,
    children = 'Conhecer os planos',
}: {
    className: string;
    children?: React.ReactNode;
}) {
    const { showPlansCta } = useBillingStatus();

    if (!showPlansCta) return null;

    return (
        <Link href="/planos" className={className}>
            {children}
        </Link>
    );
}
