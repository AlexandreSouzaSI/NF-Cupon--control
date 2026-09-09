'use client';

import { useRouter } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser } from '@/lib/auth';
import { getVisibleTours } from '@/lib/tours';
import { HelpCircle, PlayCircle } from 'lucide-react';
import { PENDING_TOUR_KEY } from '../../src/components/tour/TourGuide';

export default function HelpPage() {
    const router = useRouter();
    const user = getUser();

    const visibleTours = user ? getVisibleTours(user.role, user.isDemo) : [];

    const categories = Array.from(
        new Set(visibleTours.map((tour) => tour.category)),
    );

    function startTour(tourId: string, href: string) {
        sessionStorage.setItem(PENDING_TOUR_KEY, tourId);
        router.push(href);
    }

    return (
        <AppLayout title="Dúvidas">
            <div className="space-y-6">
                <header className="flex items-start gap-3">
                    <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-500">
                        <HelpCircle size={22} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Como fazer</h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Escolha um tutorial — ele te leva direto pra tela
                            certa e mostra o passo a passo. Pode pular a
                            qualquer momento.
                        </p>
                    </div>
                </header>

                {visibleTours.length === 0 ? (
                    <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                            Nenhum tutorial disponível pro seu perfil ainda.
                        </p>
                    </div>
                ) : (
                    categories.map((category) => (
                        <section key={category} className="space-y-3">
                            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                                {category}
                            </h3>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {visibleTours
                                    .filter((tour) => tour.category === category)
                                    .map((tour) => (
                                        <button
                                            key={tour.id}
                                            onClick={() =>
                                                startTour(tour.id, tour.href)
                                            }
                                            className="flex items-start gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left transition hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/5"
                                        >
                                            <div className="shrink-0 rounded-xl bg-emerald-500/10 p-2 text-emerald-500">
                                                <PlayCircle size={20} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold">
                                                    {tour.title}
                                                </p>
                                                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                                    {tour.description}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
        </AppLayout>
    );
}
