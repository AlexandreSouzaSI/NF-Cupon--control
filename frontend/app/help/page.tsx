'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '../../src/components/app-layout';
import { getUser } from '@/lib/auth';
import { getVisibleTours } from '@/lib/tours';
import { BookOpen, HelpCircle, PlayCircle } from 'lucide-react';
import { PENDING_TOUR_KEY } from '../../src/components/tour/TourGuide';

// Guias ilustrados são diferentes dos tours: em vez de destacar elementos
// reais na tela (spotlight), mostram um passo a passo explicado com telas
// de exemplo — pra fluxos que saem do app logado (página pública,
// WhatsApp) e por isso não dá pra fazer um tour ao vivo.
const guides: {
    id: string;
    title: string;
    description: string;
    category: string;
    href: string;
    roles: ('ADMINISTRATIVO' | 'PROPRIETARIO' | 'GERENTE' | 'COMPRADOR')[];
}[] = [
    {
        id: 'fluxo-cotacao',
        title: 'Como funciona o Fluxo de Cotação',
        description:
            'Do convite por WhatsApp até a Compra aparecer sozinha, com telas de exemplo de cada etapa.',
        category: 'Cotação',
        href: '/help/fluxo-cotacao',
        roles: ['ADMINISTRATIVO', 'PROPRIETARIO', 'GERENTE', 'COMPRADOR'],
    },
];

export default function HelpPage() {
    const router = useRouter();
    const user = getUser();

    const visibleTours = user ? getVisibleTours(user.role, user.isDemo) : [];
    const visibleGuides = user
        ? guides.filter(
              (guide) =>
                  user.isDemo || guide.roles.includes(user.role as any),
          )
        : [];

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

                {visibleGuides.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                            Guias ilustrados
                        </h3>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {visibleGuides.map((guide) => (
                                <Link
                                    key={guide.id}
                                    href={guide.href}
                                    className="flex items-start gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left transition hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-500/5"
                                >
                                    <div className="shrink-0 rounded-xl bg-teal-500/10 p-2 text-teal-500">
                                        <BookOpen size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold">
                                            {guide.title}
                                        </p>
                                        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                                            {guide.description}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

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
                                            className="flex items-start gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/5"
                                        >
                                            <div className="shrink-0 rounded-xl bg-blue-500/10 p-2 text-blue-500">
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
