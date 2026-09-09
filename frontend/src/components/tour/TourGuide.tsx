'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react';
import { tours, type Tour } from '@/lib/tours';

export const PENDING_TOUR_KEY = 'pendingTourId';

type Rect = { top: number; left: number; width: number; height: number };

// Motor genérico de tutorial passo a passo: destaca um elemento real da
// tela (via atributo data-tour) e mostra uma caixinha de texto ao lado,
// com Próximo/Voltar/Pular. Fica montado uma vez dentro do AppLayout, então
// funciona em qualquer página do sistema.
//
// Como a página de Cadastros e a de Notas Fiscais já reescrevem a URL pra
// só guardar "?tab=" (ver seus próprios useEffect de router.replace), não
// dá pra usar um parâmetro de query pra carregar o tutorial — ele seria
// apagado no primeiro re-render. Por isso a tela de Dúvidas guarda o id do
// tutorial pendente no sessionStorage antes de navegar, e esse componente
// lê dali assim que a página de destino termina de montar.
export function TourGuide() {
    const pathname = usePathname();

    const [activeTour, setActiveTour] = useState<Tour | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [searching, setSearching] = useState(false);
    // Fica true quando a busca pelo elemento do passo desiste (60s) sem
    // achar nada — acontece de propósito em passos que dependem de uma
    // ação real da pessoa antes (ex: importar um extrato), não só de a
    // tela ainda estar carregando. "Tentar novamente" reinicia a busca.
    const [notFound, setNotFound] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const pendingId = sessionStorage.getItem(PENDING_TOUR_KEY);
        if (!pendingId) return;

        const tour = tours.find((t) => t.id === pendingId);

        if (!tour) {
            sessionStorage.removeItem(PENDING_TOUR_KEY);
            return;
        }

        // Só dispara quando a navegação já chegou na página certa —
        // ignora silenciosamente enquanto ainda está em trânsito.
        const tourPath = tour.href.split('?')[0];
        if (tourPath !== pathname) return;

        sessionStorage.removeItem(PENDING_TOUR_KEY);
        setActiveTour(tour);
        setStepIndex(0);
    }, [pathname]);

    function stopSearch() {
        if (pollRef.current) clearInterval(pollRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        pollRef.current = null;
        timeoutRef.current = null;
    }

    function updateRect(el: HTMLElement) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    // Espera (com repetição) o elemento do passo atual aparecer na tela —
    // cobre o caso de a tela ainda estar carregando dados (ex: lista de
    // lojas) quando o passo começa.
    useEffect(() => {
        if (!activeTour) return;

        const step = activeTour.steps[stepIndex];
        if (!step) return;

        setRect(null);
        setSearching(true);
        setNotFound(false);
        stopSearch();

        function tryFind() {
            const el = document.querySelector(step.selector) as HTMLElement | null;
            if (!el) return;

            stopSearch();
            setSearching(false);
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => updateRect(el), 300);
        }

        tryFind();
        pollRef.current = setInterval(tryFind, 300);
        // 60s — dá tempo real pra passos que pedem uma ação antes (ex:
        // "importe o extrato"), não só carregamento de tela.
        timeoutRef.current = setTimeout(() => {
            stopSearch();
            setSearching(false);
            setNotFound(true);
        }, 60000);

        return stopSearch;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTour, stepIndex, retryKey]);

    function retry() {
        setRetryKey((k) => k + 1);
    }

    // Reposiciona o destaque se a pessoa rolar a tela ou redimensionar a
    // janela com o passo aberto.
    useEffect(() => {
        if (!activeTour) return;

        function reposition() {
            const step = activeTour?.steps[stepIndex];
            const el = step && (document.querySelector(step.selector) as HTMLElement | null);
            if (el) updateRect(el);
        }

        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);

        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTour, stepIndex]);

    function close() {
        stopSearch();
        setActiveTour(null);
        setStepIndex(0);
        setRect(null);
    }

    function next() {
        if (!activeTour) return;

        if (stepIndex >= activeTour.steps.length - 1) {
            close();
            return;
        }

        setStepIndex((i) => i + 1);
    }

    function back() {
        setStepIndex((i) => Math.max(0, i - 1));
    }

    if (!activeTour) return null;

    const step = activeTour.steps[stepIndex];
    const isLast = stepIndex === activeTour.steps.length - 1;

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 400;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    const tooltipStyle: React.CSSProperties = rect
        ? {
            top: Math.min(rect.top + rect.height + 16, viewportHeight - 220),
            left: Math.min(Math.max(rect.left, 16), Math.max(viewportWidth - 340, 16)),
        }
        : {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
        };

    return (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {rect && (
                <div
                    className="absolute rounded-xl transition-all duration-300"
                    style={{
                        top: rect.top - 6,
                        left: rect.left - 6,
                        width: rect.width + 12,
                        height: rect.height + 12,
                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
                        border: '2px solid #10b981',
                    }}
                />
            )}

            <div
                className="pointer-events-auto absolute w-[90vw] max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
                style={tooltipStyle}
            >
                <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <HelpCircle size={16} />
                        <span className="text-xs font-semibold uppercase tracking-wide">
                            Passo {stepIndex + 1} de {activeTour.steps.length}
                        </span>
                    </div>

                    <button
                        onClick={close}
                        className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Fechar tutorial"
                    >
                        <X size={16} />
                    </button>
                </div>

                <h3 className="mb-1 font-bold">{step.title}</h3>
                <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {searching
                        ? 'Procurando essa parte da tela...'
                        : step.text}
                </p>

                {notFound && (
                    <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
                        Não encontramos essa parte da tela ainda. Se o passo
                        anterior pedia uma ação (ex: importar um arquivo),
                        confira se já foi feita e{' '}
                        <button
                            onClick={retry}
                            className="font-semibold underline underline-offset-2"
                        >
                            tente novamente
                        </button>
                        .
                    </p>
                )}

                {!notFound && <div className="mb-4" />}

                <div className="flex items-center justify-between gap-2">
                    <button
                        onClick={close}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                    >
                        Pular tutorial
                    </button>

                    <div className="flex gap-2">
                        {stepIndex > 0 && (
                            <button
                                onClick={back}
                                className="inline-flex h-9 items-center gap-1 rounded-xl border border-zinc-300 dark:border-zinc-700 px-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            >
                                <ChevronLeft size={14} />
                                Voltar
                            </button>
                        )}

                        <button
                            onClick={next}
                            className="inline-flex h-9 items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                            {isLast ? 'Concluir' : 'Próximo'}
                            {!isLast && <ChevronRight size={14} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
