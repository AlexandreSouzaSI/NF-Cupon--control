'use client';

import Link from 'next/link';
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    ClipboardList,
    MessageCircle,
    ShoppingCart,
    Trophy,
} from 'lucide-react';
import { AppLayout } from '../../../src/components/app-layout';

// Guia ilustrado (não é o tour de spotlight — esse fluxo passa por página
// pública e WhatsApp, fora do app logado, então não dá pra destacar
// elemento real na tela). É só uma explicação com telas de mentirinha
// pra mostrar visualmente o que cada lado (comprador e fornecedor) vê em
// cada etapa.

function PhoneMock({ children }: { children: React.ReactNode }) {
    return (
        <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[1.5rem] border-4 border-zinc-800 bg-zinc-950 shadow-lg">
            <div className="h-4 bg-zinc-800" />
            {children}
        </div>
    );
}

function WhatsAppBubble({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-[#0b141a] p-3">
            <div className="rounded-lg rounded-tl-none bg-[#202c33] p-2.5 text-[11px] leading-snug text-zinc-100 shadow">
                {children}
            </div>
        </div>
    );
}

function StepCard({
    numero,
    icon: Icon,
    titulo,
    quem,
    children,
    mockup,
}: {
    numero: number;
    icon: React.ElementType;
    titulo: string;
    quem: string;
    children: React.ReactNode;
    mockup?: React.ReactNode;
}) {
    return (
        <div className="relative flex gap-4 sm:gap-6">
            <div className="flex flex-col items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white">
                    {numero}
                </div>
                <div className="mt-1 w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>

            <div className="flex-1 pb-10">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="rounded-lg bg-teal-500/10 p-1.5 text-teal-500">
                            <Icon size={16} />
                        </div>
                        <h3 className="font-semibold">{titulo}</h3>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            {quem}
                        </span>
                    </div>

                    <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {children}
                    </div>

                    {mockup && (
                        <div className="mt-4 flex justify-center">
                            {mockup}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function FluxoCotacaoPage() {
    return (
        <AppLayout title="Fluxo de Cotação">
            <div className="mx-auto max-w-2xl space-y-6">
                <Link
                    href="/help"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                    <ArrowLeft size={16} />
                    Voltar pra Dúvidas
                </Link>

                <header className="flex items-start gap-3">
                    <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-500">
                        <ClipboardList size={22} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">
                            Como funciona o Fluxo de Cotação
                        </h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                            Do dia agendado com o fornecedor até a Compra
                            nascer sozinha no sistema. Passo a passo, com um
                            exemplo de cada tela.
                        </p>
                    </div>
                </header>

                <div className="mt-2">
                    <StepCard
                        numero={1}
                        icon={Calendar}
                        titulo="Categoria e agenda do fornecedor"
                        quem="Cadastro (uma vez só)"
                    >
                        <p>
                            Em Cadastros → Categorias de Fornecedor, cada
                            fornecedor entra numa categoria (Hortifruti,
                            Carnes, Bebidas...) com um dia fixo da semana pra
                            cotar. A lista de itens de cada categoria fica
                            salva e editável — não precisa digitar tudo de
                            novo toda vez.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={2}
                        icon={ClipboardList}
                        titulo="Pedir a cotação"
                        quem="Você, na aba Cotação"
                    >
                        <p>
                            No dia da categoria, você abre a aba{' '}
                            <strong>Cotação</strong>, confere/ajusta a lista
                            sugerida de itens e manda pedir preço pros
                            fornecedores daquela categoria. O sistema gera um
                            link único (um token) por fornecedor.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={3}
                        icon={MessageCircle}
                        titulo="Fornecedor recebe o convite no WhatsApp"
                        quem="Automático"
                        mockup={
                            <PhoneMock>
                                <WhatsAppBubble>
                                    <p>
                                        Olá, João Hortifruti! Sou do
                                        Anchieta e gostaria que preenchesse
                                        essa cotação de <b>Hortifruti</b> (12
                                        itens) no link abaixo. Obrigado!
                                    </p>
                                </WhatsAppBubble>
                                <WhatsAppBubble>
                                    <p className="text-teal-400 underline">
                                        https://app.seudominio.com.br/cotacao-publica/8f2a1c...
                                    </p>
                                </WhatsAppBubble>
                            </PhoneMock>
                        }
                    >
                        <p>
                            O convite chega em <strong>duas mensagens</strong>{' '}
                            — o texto explicando, e logo em seguida o link
                            sozinho, pra virar clicável de verdade no
                            WhatsApp.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={4}
                        icon={ClipboardList}
                        titulo="Fornecedor preenche os preços"
                        quem="O fornecedor, sem precisar de login"
                        mockup={
                            <PhoneMock>
                                <div className="space-y-2 bg-zinc-950 p-3">
                                    <p className="text-[10px] uppercase tracking-wide text-teal-500">
                                        Cotação — Anchieta
                                    </p>
                                    <p className="text-sm font-bold text-zinc-100">
                                        Hortifruti
                                    </p>
                                    <div className="overflow-hidden rounded-lg border border-zinc-800">
                                        <div className="grid grid-cols-3 bg-zinc-900 px-2 py-1.5 text-[10px] text-zinc-500">
                                            <span>Item</span>
                                            <span>Qtd</span>
                                            <span>Preço</span>
                                        </div>
                                        {[
                                            ['Tomate', '20kg', '7,50'],
                                            ['Cebola', '10kg', '5,20'],
                                            ['Alface', '30un', '2,00'],
                                        ].map((row) => (
                                            <div
                                                key={row[0]}
                                                className="grid grid-cols-3 items-center border-t border-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300"
                                            >
                                                <span>{row[0]}</span>
                                                <span className="text-zinc-500">
                                                    {row[1]}
                                                </span>
                                                <span className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-teal-400">
                                                    R$ {row[2]}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="rounded-lg bg-teal-500 py-1.5 text-center text-[11px] font-semibold text-white">
                                        Enviar preços
                                    </div>
                                </div>
                            </PhoneMock>
                        }
                    >
                        <p>
                            Ele abre o link no celular, digita o preço de
                            cada item da lista e manda. Não precisa instalar
                            nada nem criar conta — é uma página pública só
                            daquele token.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={5}
                        icon={Trophy}
                        titulo="Você compara e escolhe o vencedor"
                        quem="Você, na aba Cotação"
                        mockup={
                            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                                <div className="grid grid-cols-4 bg-zinc-100 px-2 py-1.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                    <span>Item</span>
                                    <span>João H.</span>
                                    <span>Maria F.</span>
                                    <span>Total</span>
                                </div>
                                {[
                                    ['Tomate', 'R$ 7,50', 'R$ 8,00'],
                                    ['Cebola', 'R$ 5,20', 'R$ 4,90'],
                                ].map((row) => (
                                    <div
                                        key={row[0]}
                                        className="grid grid-cols-4 items-center border-t border-zinc-200 px-2 py-1.5 text-[11px] dark:border-zinc-800"
                                    >
                                        <span>{row[0]}</span>
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            {row[1]}
                                        </span>
                                        <span>{row[2]}</span>
                                        <span />
                                    </div>
                                ))}
                                <div className="border-t border-zinc-200 bg-zinc-50 px-2 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                        <Trophy size={12} />
                                        Escolher João Hortifruti
                                    </div>
                                </div>
                            </div>
                        }
                    >
                        <p>
                            A tela de comparação mostra o preço de cada
                            fornecedor lado a lado por item, com o menor já
                            destacado. Você clica em{' '}
                            <strong>Escolher</strong> no vencedor — não
                            precisa ser sempre o mais barato item por item,
                            você decide pelo fornecedor todo.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={6}
                        icon={MessageCircle}
                        titulo="Vencedor recebe o pedido de confirmação"
                        quem="Automático"
                        mockup={
                            <PhoneMock>
                                <WhatsAppBubble>
                                    <p>
                                        Olá! Você ganhou a cotação de{' '}
                                        <b>Hortifruti</b> pra Anchieta. Valor
                                        total do pedido: R$ 214,00. Confirme
                                        no link abaixo. Obrigado!
                                    </p>
                                </WhatsAppBubble>
                                <WhatsAppBubble>
                                    <p className="text-teal-400 underline">
                                        https://app.seudominio.com.br/cotacao-confirmar/9d7e4b...
                                    </p>
                                </WhatsAppBubble>
                            </PhoneMock>
                        }
                    >
                        <p>
                            Assim que você escolhe o vencedor, o sistema já
                            manda pra ele (de novo em duas mensagens) o valor
                            total do pedido e um segundo link, só pra
                            confirmar.
                        </p>
                    </StepCard>

                    <StepCard
                        numero={7}
                        icon={CheckCircle2}
                        titulo="Fornecedor confirma o pedido"
                        quem="O fornecedor"
                        mockup={
                            <PhoneMock>
                                <div className="space-y-2 bg-zinc-950 p-3 text-center">
                                    <p className="text-[10px] uppercase tracking-wide text-teal-500">
                                        Cotação — Anchieta
                                    </p>
                                    <p className="text-sm font-bold text-zinc-100">
                                        Hortifruti
                                    </p>
                                    <p className="text-[11px] text-zinc-400">
                                        Você venceu essa cotação. Total: R$
                                        214,00
                                    </p>
                                    <div className="rounded-lg bg-teal-500 py-1.5 text-[11px] font-semibold text-white">
                                        Confirmar pedido
                                    </div>
                                </div>
                            </PhoneMock>
                        }
                    >
                        <p>
                            Na página de confirmação ele só bate o martelo
                            clicando em <strong>Confirmar pedido</strong>. Se
                            ele não confirmar, nada é criado — o pedido fica
                            parado esperando.
                        </p>
                    </StepCard>

                    <div className="relative flex gap-4 sm:gap-6">
                        <div className="flex flex-col items-center">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <CheckCircle2 size={18} />
                            </div>
                        </div>
                        <div className="flex-1">
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 sm:p-5">
                                <div className="flex items-center gap-2">
                                    <ShoppingCart
                                        size={16}
                                        className="text-emerald-600 dark:text-emerald-400"
                                    />
                                    <h3 className="font-semibold text-emerald-700 dark:text-emerald-400">
                                        Pronto: a Compra nasce sozinha
                                    </h3>
                                </div>
                                <p className="mt-2 text-sm text-emerald-800/80 dark:text-emerald-300/80">
                                    No instante em que o fornecedor confirma,
                                    o sistema cria a Compra automaticamente
                                    com os itens, preços e o fornecedor
                                    vencedor já preenchidos — ela aparece
                                    direto na aba <strong>Compras</strong>,
                                    pronta pra seguir o fluxo normal
                                    (recebimento, cupom/NF, conta a pagar).
                                    Você não precisa digitar nada de novo.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
