import Link from 'next/link';

import {
  ShoppingCart,
  FileText,
  ClipboardList,
  PackageX,
  Users2,
  Calculator,
  Landmark,
  Bell,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ScanLine,
  BadgeCheck,
} from 'lucide-react';

// Página pública, sem 'use client' — não precisa de estado nem efeito, só
// navegação (Link) e <details>/<summary> nativos pro FAQ (funcionam sem JS).

const recursos = [
  {
    icon: ShoppingCart,
    title: 'Compras',
    description:
      'Cadastro, aprovação e recebimento de compras numa fila só, com divergência de recebimento sinalizada na hora.',
  },
  {
    icon: FileText,
    title: 'Notas fiscais',
    description:
      'Entrada e saída de NF-e/NFS-e buscadas direto da Sefaz, conciliadas com a compra automaticamente.',
  },
  {
    icon: Landmark,
    title: 'Contas a pagar',
    description:
      'Boleto lido por código de barras, conciliação bancária por OFX e previsão de pagamento por período.',
  },
  {
    icon: PackageX,
    title: 'Perdas',
    description:
      'Registro de perda com foto, valor e NF de baixa de estoque emitida direto pro fisco quando necessário.',
  },
  {
    icon: Users2,
    title: 'Funcionários e freelancers',
    description:
      'Folha, vale-transporte e diária de freelancer com previsão de pagamento por período, tudo num só lugar.',
  },
  {
    icon: Calculator,
    title: 'Tributos',
    description:
      'Apuração de Simples Nacional, Lucro Presumido e Lucro Real com crédito de ICMS/PIS/COFINS calculado.',
  },
  {
    icon: ClipboardList,
    title: 'Tarefas',
    description:
      'Quadro estilo Trello por pessoa e por loja, com notificação de atraso e confirmação com foto.',
  },
  {
    icon: Bell,
    title: 'Alertas em tempo real',
    description:
      'Notificação push e WhatsApp pra quem precisa agir — sem depender de olhar o sistema toda hora.',
  },
];

const comoFunciona = [
  {
    step: '1',
    title: 'Cadastre suas empresas',
    description:
      'Cada loja ou unidade entra com CNPJ, endereço fiscal e certificado digital próprio — igual já funciona hoje.',
  },
  {
    step: '2',
    title: 'Convide seu time',
    description:
      'Proprietário, administrativo, gerente ou funcionário — cada perfil vê só o que precisa ver.',
  },
  {
    step: '3',
    title: 'O sistema puxa o resto sozinho',
    description:
      'NF de compra, nota de serviço e boleto chegam automaticamente, prontos pra conferir e aprovar.',
  },
  {
    step: '4',
    title: 'Decida com números atualizados',
    description:
      'Dashboard, relatórios e apuração de tributos sempre com dado do dia — sem planilha paralela.',
  },
];

const faqs = [
  {
    question: 'O GestIA já emite nota fiscal de verdade?',
    answer:
      'Sim. O sistema já busca automaticamente as notas de compra e serviço direto da Sefaz, e também já emite nota fiscal de baixa por perda e devolução, homologada com o webservice oficial.',
  },
  {
    question: 'Dá pra usar em mais de uma loja/empresa?',
    answer:
      'Sim, é o uso pensado desde o início: cada empresa mantém seu próprio CNPJ, certificado e série de nota, e quem tem acesso a várias troca entre elas no topo da tela sem precisar logar de novo.',
  },
  {
    question: 'Preciso instalar alguma coisa?',
    answer:
      'Não. É um sistema web que também funciona como app (PWA) — dá pra adicionar à tela inicial do celular e receber notificação push, sem passar por loja de aplicativo.',
  },
  {
    question: 'Como funciona o teste?',
    answer:
      'Você cadastra uma loja de demonstração e usa o sistema completo por tempo limitado, sem compromisso. Depois é só falar com a gente pra seguir com a sua empresa de verdade.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <FileText size={22} className="text-emerald-400" />
            <strong className="text-lg">GestIA</strong>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              Entrar
            </Link>

            <Link
              href="/demo"
              className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600"
            >
              Testar grátis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-emerald-500">
          <BadgeCheck size={14} />
          Já em uso real, todos os dias
        </span>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight sm:text-5xl">
          Compras, notas fiscais e financeiro da sua rede de lojas,
          num só lugar.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
          O GestIA centraliza compra, recebimento, nota fiscal, conta a
          pagar, tarefas e tributos de cada empresa do seu grupo — pra
          acabar com compra sem documento, conta esquecida e informação
          espalhada em WhatsApp e planilha.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/demo"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600 sm:w-auto"
          >
            Testar grátis
            <ArrowRight size={18} />
          </Link>

          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 px-6 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Como funciona */}
      <section
        id="como-funciona"
        className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
      >
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Como funciona</h2>

          <p className="mx-auto mt-3 max-w-xl text-center text-zinc-600 dark:text-zinc-400">
            Sem migração complicada — o sistema já nasce pronto pra
            trabalhar com seus dados fiscais reais.
          </p>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {comoFunciona.map((item) => (
              <div key={item.step}>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 font-bold text-zinc-900 dark:text-white">
                  {item.step}
                </div>

                <h3 className="font-semibold">{item.title}</h3>

                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">
          Tudo que a operação precisa
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-600 dark:text-zinc-400">
          Módulos que já rodam em produção, pensados pra rede de lojas de
          verdade.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {recursos.map((recurso) => (
            <div
              key={recurso.title}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
            >
              <recurso.icon size={22} className="text-emerald-400" />

              <h3 className="mt-3 font-semibold">{recurso.title}</h3>

              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {recurso.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section
        id="planos"
        className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
      >
        <div className="mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">Um plano do tamanho da sua rede</h2>

          <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            Cada empresa do seu grupo entra separadamente, com o que ela
            usa. Sem pacote fechado, sem módulo que você não precisa.
          </p>

          <div className="mx-auto mt-10 max-w-md rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-8 text-left">
            <p className="text-sm font-semibold text-emerald-500">
              Sob medida por empresa
            </p>

            <ul className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
              {[
                'Compras, recebimento e conta a pagar',
                'Nota fiscal de entrada, saída e de baixa por perda',
                'Tarefas, RH e controle de tributos',
                'Notificação por push e WhatsApp',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 shrink-0 text-emerald-400"
                  />
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href="/demo"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-500 font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600"
            >
              Testar grátis
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* Confiança */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
          <ScanLine size={28} className="mx-auto text-emerald-400" />

          <h2 className="mt-4 text-2xl font-bold">
            Validado na operação de verdade
          </h2>

          <p className="mx-auto mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
            O GestIA não nasceu de planilha de protótipo — ele roda hoje
            no dia a dia de uma rede real de lojas, cuidando de compra,
            nota fiscal e financeiro desde o primeiro café da manhã até o
            fechamento do caixa.
          </p>

          <div className="mx-auto mt-8 flex max-w-xl flex-col justify-center gap-6 sm:flex-row">
            <div>
              <p className="text-2xl font-bold text-emerald-400">3+</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                empresas de um mesmo grupo, no mesmo painel
              </p>
            </div>

            <div>
              <p className="text-2xl font-bold text-emerald-400">100%</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                das notas de compra buscadas direto da Sefaz
              </p>
            </div>

            <div>
              <p className="text-2xl font-bold text-emerald-400">24/7</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                sincronização automática, sem intervenção manual
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
      >
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">
            Perguntas frequentes
          </h2>

          <div className="mt-10 space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5"
              >
                <summary className="flex cursor-pointer items-center justify-between font-semibold marker:content-none">
                  {faq.question}

                  <ClipboardCheck
                    size={18}
                    className="text-emerald-400 opacity-0 transition group-open:opacity-100"
                  />
                </summary>

                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl font-bold">
          Pronto pra tirar sua operação da planilha?
        </h2>

        <p className="mx-auto mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
          Cadastre uma loja de teste agora e veja o sistema completo
          funcionando com seus próprios dados.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/demo"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-6 font-semibold text-zinc-900 dark:text-white transition hover:bg-green-600 sm:w-auto"
          >
            Testar grátis
            <ArrowRight size={18} />
          </Link>

          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center rounded-xl border border-zinc-300 dark:border-zinc-700 px-6 font-semibold text-zinc-700 dark:text-zinc-300 transition hover:bg-zinc-100 dark:hover:bg-zinc-800 sm:w-auto"
          >
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-zinc-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-emerald-400" />
            GestIA
          </div>

          <p>© {new Date().getFullYear()} GestIA. Todos os direitos reservados.</p>
        </div>
      </footer>
    </main>
  );
}
