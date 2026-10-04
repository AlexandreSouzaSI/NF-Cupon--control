'use client';

import { useEffect, useState } from 'react';

import { api } from './api';
import { getToken, getUser } from './auth';

export type PlanDto = {
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    modules: string[];
    active: boolean;
    sortOrder: number;
};

export type SubscriptionStatus =
    | 'PENDING'
    | 'ACTIVE'
    | 'PAST_DUE'
    | 'CANCELED';

export type BillingPayment = {
    id: string;
    asaasPaymentId: string;
    valueCents: number;
    status: string;
    billingType: string | null;
    invoiceUrl: string | null;
    dueDate: string | null;
    paidAt: string | null;
};

// Resposta de GET /billing/me. `exempt: true` = Admin Master ou empresa
// planExempt (Nugalho): a UI NUNCA mostra nada de planos/cobrança pra eles.
export type BillingMe =
    | { exempt: true; reason?: string }
    | {
        exempt: false;
        isTrial: boolean;
        trialExpiresAt: string | null;
        trialExpired: boolean;
        canManageBilling: boolean;
        asaasConfigured: boolean;
        account: {
            role: string;
            isDemo: boolean;
            demoExpiresAt: string | null;
            empresaId: string | null;
        };
        empresa: { id: string; name: string; cnpj: string | null } | null;
        subscription: null | {
            id: string;
            status: SubscriptionStatus;
            plan: {
                id: string;
                name: string;
                priceCents: number;
                modules: string[];
            };
            currentPeriodEnd: string | null;
            graceUntil: string | null;
            modulesBlockedAt: string | null;
            openInvoiceUrl: string | null;
            payments: BillingPayment[];
        };
    };

export function formatBRL(cents: number) {
    return (cents / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

export function formatDateBR(value?: string | null) {
    if (!value) return '—';

    return new Date(value).toLocaleDateString('pt-BR');
}

export async function fetchBillingMe(sync = false): Promise<BillingMe> {
    const response = await api.get('/billing/me', {
        params: sync ? { sync: 1 } : undefined,
    });

    return response.data;
}

// Estado de cobrança do usuário logado, pro layout/landing decidirem se
// mostram "Conhecer os planos". `loaded` evita piscar o CTA antes da
// resposta; Admin Master nem chama a API (é isento por definição).
// Visitante (sem token) é tratado como "não isento, sem dados": a landing
// mostra os CTAs pra ele.
export function useBillingStatus() {
    const [state, setState] = useState<{
        loaded: boolean;
        me: BillingMe | null;
        loggedIn: boolean;
    }>({ loaded: false, me: null, loggedIn: false });

    useEffect(() => {
        let cancelled = false;
        const token = getToken();
        const user = getUser();

        if (!token || !user) {
            setState({ loaded: true, me: null, loggedIn: false });
            return;
        }

        if (user.isAdminMaster) {
            setState({
                loaded: true,
                me: { exempt: true, reason: 'ADMIN_MASTER' },
                loggedIn: true,
            });
            return;
        }

        fetchBillingMe()
            .then((me) => {
                if (!cancelled) setState({ loaded: true, me, loggedIn: true });
            })
            .catch(() => {
                // Falha de rede/403 de teste vencido: sem dado de cobrança,
                // o chamador cai no comportamento seguro (não mostra nada
                // que dependa da assinatura).
                if (!cancelled) setState({ loaded: true, me: null, loggedIn: true });
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // Mostrar CTA de planos? Visitante sim; logado só se a API confirmou
    // que NÃO é isento.
    const showPlansCta =
        state.loaded &&
        (!state.loggedIn || (state.me !== null && state.me.exempt === false));

    return { ...state, showPlansCta };
}
