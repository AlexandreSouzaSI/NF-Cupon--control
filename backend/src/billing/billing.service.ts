import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
    Prisma,
    StoreModule,
    SubscriptionStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AsaasApiError, AsaasClient, AsaasPayment } from './asaas.client';
import {
    DAY_MS,
    DEMO_EMPRESA_ID,
    GRACE_DAYS,
    PAID_PAYMENT_STATUSES,
    PERIOD_DAYS,
} from './billing.constants';
import { CheckoutDto, GrantSubscriptionDto } from './dto/checkout.dto';

type Tx = Prisma.TransactionClient;

// Assinatura carregada com o que o fluxo de ativação/bloqueio precisa.
type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
    include: { plan: true; empresa: true };
}>;

function onlyDigits(value?: string | null) {
    return (value || '').replace(/\D/g, '');
}

// "YYYY-MM-DD" do dia de hoje no fuso de Brasília — o Asaas trabalha com
// data de vencimento sem horário, e "hoje" em UTC viraria "amanhã" à noite.
function todayBrasilia() {
    return new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Sao_Paulo',
    });
}

// Datas do Asaas vêm como "YYYY-MM-DD". Grava ao meio-dia UTC (mesma ideia
// do resto do projeto com <input type="date">) pra não recuar um dia por
// causa de fuso ao exibir.
function dateFromYmd(value?: string | null) {
    if (!value) return null;

    const parsed = new Date(`${value}T12:00:00.000Z`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Lógica de planos e cobrança. Regras principais:
//  - Empresa com planExempt (Nugalho) e Admin Master NUNCA entram em nada
//    daqui: sem CTA, sem checkout, sem bloqueio.
//  - O plano DEFINE o conjunto de módulos das lojas reais da empresa
//    (substitui o que havia; não soma). Lojas "Pessoa Física" continuam
//    restritas a Contas a Pagar, como já eram desde a criação.
//  - Empresa sem nenhuma Subscription (cliente antigo) nunca é bloqueada:
//    o bloqueio só existe pra quem assinou e deixou vencer.
//  - Todo evento de pagamento (webhook OU consulta ao Asaas) passa por
//    applyPayment(), idempotente por asaasPaymentId.
@Injectable()
export class BillingService {
    private readonly logger = new Logger('BillingService');

    constructor(
        private prisma: PrismaService,
        private asaas: AsaasClient,
    ) { }

    // ------------------------------------------------------------------
    // Contexto: de quem é a cobrança e se a conta está isenta
    // ------------------------------------------------------------------

    private async resolveContext(user: any) {
        if (user?.isAdminMaster) {
            return {
                exempt: true as const,
                reason: 'ADMIN_MASTER',
                empresa: null,
                subscription: null,
            };
        }

        // Conta de teste ainda não tem empresa própria: a empresa real só
        // nasce no checkout, ligada à assinatura por trialUserId.
        if (user?.isDemo && !user.empresaId) {
            const subscription = await this.prisma.subscription.findFirst({
                where: { trialUserId: user.id },
                orderBy: { createdAt: 'desc' },
                include: { plan: true, empresa: true },
            });

            return {
                exempt: false as const,
                reason: null,
                empresa: subscription?.empresa ?? null,
                subscription,
            };
        }

        if (!user?.empresaId) {
            // Conta órfã (sem empresa): não há de quem cobrar.
            return {
                exempt: true as const,
                reason: 'NO_EMPRESA',
                empresa: null,
                subscription: null,
            };
        }

        const empresa = await this.prisma.empresa.findUnique({
            where: { id: user.empresaId },
        });

        if (!empresa || empresa.planExempt) {
            return {
                exempt: true as const,
                reason: 'PLAN_EXEMPT',
                empresa,
                subscription: null,
            };
        }

        const subscription = await this.prisma.subscription.findFirst({
            where: { empresaId: empresa.id },
            orderBy: { createdAt: 'desc' },
            include: { plan: true, empresa: true },
        });

        return { exempt: false as const, reason: null, empresa, subscription };
    }

    // ------------------------------------------------------------------
    // GET /billing/me
    // ------------------------------------------------------------------

    async getMe(user: any, options: { sync?: boolean } = {}) {
        const context = await this.resolveContext(user);

        if (context.exempt) {
            return { exempt: true, reason: context.reason };
        }

        let subscription = context.subscription;

        // Rede de segurança do webhook: na tela de planos (sync=1), se a
        // assinatura ainda não confirmou, pergunta ao Asaas o estado atual
        // das cobranças — assim o pagamento libera mesmo se o webhook
        // atrasou/falhou. Só nesses estados e só na tela de planos pra não
        // bater no Asaas a cada carregamento de página.
        if (
            options.sync &&
            subscription?.asaasSubscriptionId &&
            this.asaas.isConfigured() &&
            (subscription.status === 'PENDING' ||
                subscription.status === 'PAST_DUE')
        ) {
            try {
                await this.syncPayments(subscription);
            } catch (error) {
                this.logger.warn(
                    `Falha ao sincronizar cobranças da assinatura ${subscription.id}: ${(error as Error).message}`,
                );
            }

            subscription = await this.prisma.subscription.findUnique({
                where: { id: subscription.id },
                include: { plan: true, empresa: true },
            });

            // A sincronização pode ter confirmado o pagamento e convertido a
            // conta de teste em real: relê o usuário pra resposta já sair
            // com o estado novo (req.user é de antes da conversão).
            user =
                (await this.prisma.user.findUnique({ where: { id: user.id } })) ??
                user;
        }

        const payments = subscription
            ? await this.prisma.subscriptionPayment.findMany({
                where: { subscriptionId: subscription.id },
                orderBy: { createdAt: 'desc' },
                take: 12,
            })
            : [];

        const openPayment = payments.find(
            (payment) =>
                (payment.status === 'PENDING' || payment.status === 'OVERDUE') &&
                payment.invoiceUrl,
        );

        const trialExpiresAt = user.isDemo ? user.demoExpiresAt ?? null : null;

        return {
            exempt: false,
            isTrial: Boolean(user.isDemo),
            trialExpiresAt,
            trialExpired: Boolean(
                user.isDemo &&
                trialExpiresAt &&
                new Date(trialExpiresAt) < new Date(),
            ),
            // Só Proprietário/Administrativo (e a conta de teste, que vai
            // virar Proprietário) podem assinar — a tela esconde o botão.
            canManageBilling:
                Boolean(user.isDemo) ||
                user.role === UserRole.PROPRIETARIO ||
                user.role === UserRole.ADMINISTRATIVO,
            asaasConfigured: this.asaas.isConfigured(),
            // Estado atual da conta no banco — depois do pagamento a conta
            // de teste vira real (isDemo=false, Proprietário), e o
            // frontend usa isso pra atualizar o cookie `user` sem precisar
            // deslogar/logar de novo.
            account: {
                role: user.role,
                isDemo: Boolean(user.isDemo),
                demoExpiresAt: user.demoExpiresAt ?? null,
                empresaId: user.empresaId ?? null,
            },
            empresa: context.empresa
                ? {
                    id: context.empresa.id,
                    name: context.empresa.name,
                    cnpj: context.empresa.cnpj,
                }
                : null,
            subscription: subscription
                ? {
                    id: subscription.id,
                    status: subscription.status,
                    plan: {
                        id: subscription.plan.id,
                        name: subscription.plan.name,
                        priceCents: subscription.plan.priceCents,
                        modules: subscription.plan.modules,
                    },
                    currentPeriodEnd: subscription.currentPeriodEnd,
                    graceUntil: subscription.currentPeriodEnd
                        ? new Date(
                            subscription.currentPeriodEnd.getTime() +
                            GRACE_DAYS * DAY_MS,
                        )
                        : null,
                    modulesBlockedAt: subscription.modulesBlockedAt,
                    openInvoiceUrl: openPayment?.invoiceUrl ?? null,
                    payments,
                }
                : null,
        };
    }

    // ------------------------------------------------------------------
    // POST /billing/checkout
    // ------------------------------------------------------------------

    async checkout(user: any, dto: CheckoutDto) {
        const context = await this.resolveContext(user);

        if (context.exempt) {
            throw new ForbiddenException(
                'Sua conta não precisa de plano.',
            );
        }

        if (!this.asaas.isConfigured()) {
            throw new ServiceUnavailableException(
                'O pagamento online ainda não está configurado. Fale com o suporte.',
            );
        }

        // Preço e módulos SEMPRE do banco — o cliente só escolhe o id.
        const plan = await this.prisma.plan.findFirst({
            where: { id: dto.planId, active: true },
        });

        if (!plan) {
            throw new NotFoundException('Plano não encontrado ou inativo.');
        }

        const now = new Date();
        const current = context.subscription;

        // Plano em vigor pago: trocar na marra faria o cliente perder dias
        // já pagos. Troca/ajuste fica com o suporte (liberação manual).
        if (
            current &&
            current.status === 'ACTIVE' &&
            current.currentPeriodEnd &&
            current.currentPeriodEnd > now
        ) {
            throw new ConflictException(
                'Sua empresa já tem um plano ativo. Para trocar de plano, fale com o suporte.',
            );
        }

        const cpfCnpj = onlyDigits(dto.cpfCnpj) || onlyDigits(context.empresa?.cnpj);

        if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
            throw new BadRequestException({
                message:
                    'Informe o CPF ou CNPJ de quem vai pagar para gerar a cobrança.',
                code: 'FISCAL_DATA_REQUIRED',
            });
        }

        // Empresa: a existente, ou (conta de teste) uma nova criada agora.
        let empresa = context.empresa;

        if (!empresa) {
            const name = dto.empresaName?.trim();

            if (!name) {
                throw new BadRequestException({
                    message: 'Informe o nome da sua empresa.',
                    code: 'FISCAL_DATA_REQUIRED',
                });
            }

            empresa = await this.prisma.empresa.create({
                data: { name, cnpj: cpfCnpj },
            });
        } else if (onlyDigits(empresa.cnpj) !== cpfCnpj) {
            // O documento informado agora é o de quem paga: atualiza o
            // cadastro (Empresa.cnpj aceita CPF de pessoa física também).
            empresa = await this.prisma.empresa.update({
                where: { id: empresa.id },
                data: { cnpj: cpfCnpj },
            });
        }

        try {
            let customerId = empresa.asaasCustomerId;

            if (!customerId) {
                const customer = await this.asaas.createCustomer({
                    name: empresa.name,
                    cpfCnpj,
                    email: user.email,
                    externalReference: empresa.id,
                });

                customerId = customer.id;

                await this.prisma.empresa.update({
                    where: { id: empresa.id },
                    data: { asaasCustomerId: customerId },
                });
            }

            // Uma assinatura viva por empresa: antes de criar a nova,
            // encerra (no Asaas e aqui) qualquer anterior que sobrou
            // PENDING/PAST_DUE/ACTIVE-vencida, senão o cliente seria
            // cobrado duas vezes.
            const previous = await this.prisma.subscription.findMany({
                where: {
                    empresaId: empresa.id,
                    status: { not: 'CANCELED' },
                },
            });

            for (const old of previous) {
                if (old.asaasSubscriptionId) {
                    try {
                        await this.asaas.deleteSubscription(
                            old.asaasSubscriptionId,
                        );
                    } catch (error) {
                        // 404 = já não existe lá; qualquer outro erro
                        // aborta pra não deixar cobrança dupla.
                        if (!(error instanceof AsaasApiError && error.status === 404)) {
                            throw error;
                        }
                    }
                }

                await this.prisma.subscription.update({
                    where: { id: old.id },
                    data: { status: 'CANCELED' },
                });
            }

            const subscription = await this.prisma.subscription.create({
                data: {
                    empresaId: empresa.id,
                    planId: plan.id,
                    status: 'PENDING',
                    asaasCustomerId: customerId,
                    trialUserId: user.isDemo ? user.id : null,
                },
            });

            let asaasSubscription;

            try {
                asaasSubscription = await this.asaas.createSubscription({
                    customer: customerId,
                    value: plan.priceCents / 100,
                    nextDueDate: todayBrasilia(),
                    description: `Galho Hub — plano ${plan.name}`,
                    // Liga a cobrança de volta a esta linha mesmo se o
                    // webhook vier sem o id da assinatura.
                    externalReference: subscription.id,
                });
            } catch (error) {
                await this.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: { status: 'CANCELED' },
                });

                throw error;
            }

            await this.prisma.subscription.update({
                where: { id: subscription.id },
                data: { asaasSubscriptionId: asaasSubscription.id },
            });

            // O Asaas gera a 1ª cobrança junto da assinatura; busca pra
            // devolver o link de pagamento na hora. Se ainda não existir,
            // a tela de planos busca de novo (getMe com sync).
            let invoiceUrl: string | null = null;

            try {
                const payments = await this.asaas.listSubscriptionPayments(
                    asaasSubscription.id,
                );

                for (const payment of payments.data ?? []) {
                    await this.applyPayment(null, payment);

                    if (!invoiceUrl && payment.invoiceUrl) {
                        invoiceUrl = payment.invoiceUrl;
                    }
                }
            } catch (error) {
                this.logger.warn(
                    `Assinatura ${subscription.id} criada, mas não consegui listar a 1ª cobrança: ${(error as Error).message}`,
                );
            }

            return {
                subscriptionId: subscription.id,
                status: 'PENDING',
                invoiceUrl,
            };
        } catch (error) {
            if (error instanceof AsaasApiError) {
                // 4xx do Asaas traz texto útil pro usuário (ex.: CPF
                // inválido); falha de rede/5xx vira "tente de novo".
                if (error.status >= 400 && error.status < 500) {
                    throw new BadRequestException(error.message);
                }

                throw new BadGatewayException(
                    'O Asaas está indisponível agora. Tente novamente em instantes.',
                );
            }

            throw error;
        }
    }

    // ------------------------------------------------------------------
    // POST /billing/cancel
    // ------------------------------------------------------------------

    // Cancela a renovação. Os módulos continuam até o fim do período já
    // pago (o cron remove depois) — cancelar não devolve nem corta dias.
    async cancel(user: any) {
        const context = await this.resolveContext(user);

        if (context.exempt || !context.subscription) {
            throw new NotFoundException('Nenhuma assinatura para cancelar.');
        }

        const subscription = context.subscription;

        if (subscription.status === 'CANCELED') {
            throw new ConflictException('Essa assinatura já foi cancelada.');
        }

        if (subscription.asaasSubscriptionId && this.asaas.isConfigured()) {
            try {
                await this.asaas.deleteSubscription(
                    subscription.asaasSubscriptionId,
                );
            } catch (error) {
                if (!(error instanceof AsaasApiError && error.status === 404)) {
                    throw new BadGatewayException(
                        'Não consegui cancelar no Asaas agora. Tente novamente.',
                    );
                }
            }
        }

        await this.prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELED' },
        });

        return { status: 'CANCELED', currentPeriodEnd: subscription.currentPeriodEnd };
    }

    // ------------------------------------------------------------------
    // Webhook do Asaas (POST /billing/webhook, público + token)
    // ------------------------------------------------------------------

    async handleWebhook(body: any) {
        const event: string | undefined = body?.event;

        if (!event) {
            return { ignored: true };
        }

        if (event.startsWith('PAYMENT_') && body.payment?.id) {
            return this.applyPayment(event, body.payment);
        }

        if (
            event === 'SUBSCRIPTION_DELETED' ||
            event === 'SUBSCRIPTION_INACTIVATED'
        ) {
            const asaasId: string | undefined = body.subscription?.id;

            if (!asaasId) return { ignored: true };

            const subscription = await this.prisma.subscription.findUnique({
                where: { asaasSubscriptionId: asaasId },
            });

            if (!subscription) return { ignored: true };

            // Só marca; os módulos seguem até o fim do período pago (ou
            // já foram removidos, se estava vencida) — o cron cuida.
            if (subscription.status !== 'CANCELED') {
                await this.prisma.subscription.update({
                    where: { id: subscription.id },
                    data: { status: 'CANCELED' },
                });
            }

            return { canceled: true };
        }

        return { ignored: true };
    }

    // Núcleo idempotente: webhook e sincronização passam por aqui. A chave
    // é o asaasPaymentId — reenvio do mesmo evento não prorroga duas vezes
    // porque só ativa na TRANSIÇÃO "não pago → pago".
    async applyPayment(event: string | null, payment: AsaasPayment) {
        const subscription = await this.findSubscriptionForPayment(payment);

        if (!subscription) {
            // Cobrança que não é de assinatura nossa (avulsa, outro
            // sistema na mesma conta Asaas): responde 200 e segue.
            return { ignored: true };
        }

        const isDeleted = event === 'PAYMENT_DELETED';
        const status = isDeleted
            ? 'DELETED'
            : String(payment.status || this.statusFromEvent(event));

        return this.prisma.$transaction(async (tx) => {
            // Relê dentro da transação: o snapshot de fora pode estar velho.
            const fresh = await tx.subscription.findUnique({
                where: { id: subscription.id },
                include: { plan: true, empresa: true },
            });

            if (!fresh) return { ignored: true };

            const existing = await tx.subscriptionPayment.findUnique({
                where: { asaasPaymentId: payment.id },
            });

            const wasPaid = Boolean(
                existing && PAID_PAYMENT_STATUSES.has(existing.status),
            );
            const isPaid = PAID_PAYMENT_STATUSES.has(status);

            // Evento fora de ordem (ex.: OVERDUE chegando depois de
            // RECEIVED) não pode "despagar" a cobrança.
            const finalStatus =
                wasPaid && !isPaid && status !== 'REFUNDED'
                    ? existing!.status
                    : status;

            const data = {
                valueCents: Math.round(Number(payment.value) * 100),
                status: finalStatus,
                billingType: payment.billingType ?? null,
                invoiceUrl: payment.invoiceUrl ?? existing?.invoiceUrl ?? null,
                dueDate: dateFromYmd(payment.dueDate),
                paidAt: isPaid
                    ? existing?.paidAt ??
                    dateFromYmd(payment.paymentDate || payment.confirmedDate) ??
                    new Date()
                    : existing?.paidAt ?? null,
            };

            await tx.subscriptionPayment.upsert({
                where: { asaasPaymentId: payment.id },
                create: {
                    subscriptionId: fresh.id,
                    asaasPaymentId: payment.id,
                    ...data,
                },
                update: data,
            });

            if (isPaid && !wasPaid) {
                // Pagamento de assinatura cancelada: registra, mas não
                // reabre acesso (a renovação já foi encerrada).
                if (fresh.status === 'CANCELED') {
                    return { recorded: true };
                }

                await this.activate(tx, fresh);

                return { activated: true };
            }

            if (status === 'OVERDUE' && fresh.status === 'ACTIVE') {
                // Respeita a tolerância: OVERDUE chega 1 dia depois do
                // vencimento, mas só bloqueia passados GRACE_DAYS do fim do
                // período pago (o cron diário também confere isso).
                if (this.isPastGrace(fresh, new Date())) {
                    await this.expire(tx, fresh);

                    return { expired: true };
                }
            }

            if (isDeleted && fresh.status === 'PENDING') {
                // Cobrança inicial apagada e nada mais em aberto: a
                // assinatura nunca vai ser paga, encerra.
                const stillOpen = await tx.subscriptionPayment.count({
                    where: {
                        subscriptionId: fresh.id,
                        asaasPaymentId: { not: payment.id },
                        status: { in: ['PENDING', 'OVERDUE'] },
                    },
                });

                if (stillOpen === 0) {
                    await tx.subscription.update({
                        where: { id: fresh.id },
                        data: { status: 'CANCELED' },
                    });

                    return { canceled: true };
                }
            }

            return { recorded: true };
        });
    }

    private statusFromEvent(event: string | null) {
        switch (event) {
            case 'PAYMENT_CONFIRMED':
                return 'CONFIRMED';
            case 'PAYMENT_RECEIVED':
                return 'RECEIVED';
            case 'PAYMENT_OVERDUE':
                return 'OVERDUE';
            default:
                return 'PENDING';
        }
    }

    private async findSubscriptionForPayment(payment: AsaasPayment) {
        if (payment.subscription) {
            const bySubscription = await this.prisma.subscription.findUnique({
                where: { asaasSubscriptionId: payment.subscription },
            });

            if (bySubscription) return bySubscription;
        }

        if (payment.externalReference) {
            return this.prisma.subscription.findUnique({
                where: { id: payment.externalReference },
            });
        }

        return null;
    }

    private async syncPayments(subscription: { id: string; asaasSubscriptionId: string | null }) {
        if (!subscription.asaasSubscriptionId) return;

        const result = await this.asaas.listSubscriptionPayments(
            subscription.asaasSubscriptionId,
        );

        for (const payment of result.data ?? []) {
            await this.applyPayment(null, {
                ...payment,
                // Garante o vínculo mesmo se a listagem omitir o campo.
                subscription: payment.subscription ?? subscription.asaasSubscriptionId,
            });
        }
    }

    // ------------------------------------------------------------------
    // Ativação / bloqueio
    // ------------------------------------------------------------------

    private isPastGrace(
        subscription: { status: SubscriptionStatus; currentPeriodEnd: Date | null },
        now: Date,
    ) {
        if (!subscription.currentPeriodEnd) return false;

        // Assinatura cancelada não tem renovação a esperar: corta no fim
        // do período pago, sem tolerância.
        const grace = subscription.status === 'CANCELED' ? 0 : GRACE_DAYS;

        return (
            subscription.currentPeriodEnd.getTime() + grace * DAY_MS <
            now.getTime()
        );
    }

    // Pagamento confirmado: +30 dias (a partir do fim do período se ainda
    // estiver vigente — pagar adiantado não perde dias — ou de agora),
    // libera os módulos do plano e, se veio de conta de teste, transforma
    // teste em conta real.
    private async activate(tx: Tx, subscription: SubscriptionWithPlan) {
        const now = new Date();
        const base =
            subscription.currentPeriodEnd &&
                subscription.currentPeriodEnd > now
                ? subscription.currentPeriodEnd
                : now;

        const currentPeriodEnd = new Date(
            base.getTime() + PERIOD_DAYS * DAY_MS,
        );

        if (subscription.trialUserId) {
            await this.convertTrialToReal(tx, subscription);
        }

        await this.setStoreModules(
            tx,
            subscription.empresaId,
            subscription.plan.modules,
        );

        await tx.subscription.update({
            where: { id: subscription.id },
            data: {
                status: 'ACTIVE',
                currentPeriodEnd,
                modulesBlockedAt: null,
            },
        });
    }

    // Teste grátis → conta real. A loja descartável (Store.isDemo) passa
    // pra empresa nova e deixa de ser demo; o usuário vira Proprietário da
    // própria empresa. Idempotente: se o usuário já não é isDemo, nada a
    // fazer. Os dados criados durante o teste ficam (a loja é a mesma).
    private async convertTrialToReal(tx: Tx, subscription: SubscriptionWithPlan) {
        const trialUser = await tx.user.findUnique({
            where: { id: subscription.trialUserId! },
            include: { userStores: { include: { store: true } } },
        });

        if (!trialUser || !trialUser.isDemo) return;

        const demoStoreIds = trialUser.userStores
            .filter((link) => link.store.isDemo)
            .map((link) => link.storeId);

        if (demoStoreIds.length > 0) {
            await tx.store.updateMany({
                where: { id: { in: demoStoreIds } },
                data: {
                    empresaId: subscription.empresaId,
                    isDemo: false,
                    active: true,
                    name: subscription.empresa.name,
                },
            });
        }

        await tx.user.update({
            where: { id: trialUser.id },
            data: {
                isDemo: false,
                demoExpiresAt: null,
                active: true,
                empresaId: subscription.empresaId,
                role: UserRole.PROPRIETARIO,
            },
        });

        await tx.empresa.update({
            where: { id: subscription.empresaId },
            data: { active: true },
        });
    }

    // Aplica o conjunto de módulos nas lojas REAIS da empresa. Loja
    // "Pessoa Física" nunca ganha mais que Contas a Pagar (regra original
    // dela). Lista vazia = bloqueio.
    private async setStoreModules(
        tx: Tx,
        empresaId: string,
        modules: StoreModule[],
    ) {
        const stores = await tx.store.findMany({
            where: { empresaId, isDemo: false },
            select: { id: true, tipoPessoa: true },
        });

        for (const store of stores) {
            await tx.store.update({
                where: { id: store.id },
                data: {
                    enabledModules:
                        store.tipoPessoa === 'FISICA'
                            ? modules.filter(
                                (module) => module === StoreModule.CONTAS_A_PAGAR,
                            )
                            : modules,
                },
            });
        }
    }

    // Remove os módulos pagos. Planos/Cobrança não são módulos, então o
    // usuário bloqueado continua chegando em /planos pra regularizar.
    private async expire(tx: Tx, subscription: SubscriptionWithPlan) {
        await this.setStoreModules(tx, subscription.empresaId, []);

        await tx.subscription.update({
            where: { id: subscription.id },
            data: {
                status:
                    subscription.status === 'CANCELED' ? 'CANCELED' : 'PAST_DUE',
                modulesBlockedAt: new Date(),
            },
        });
    }

    // Cron diário (03:00 de Brasília): fecha as assinaturas cujo período
    // pago + tolerância acabou. Só olha quem ainda não foi bloqueado
    // (modulesBlockedAt nulo), então rodar de novo é inofensivo.
    @Cron('0 3 * * *', { timeZone: 'America/Sao_Paulo' })
    async expireDueSubscriptions(now: Date = new Date()) {
        const candidates = await this.prisma.subscription.findMany({
            where: {
                modulesBlockedAt: null,
                status: { in: ['ACTIVE', 'CANCELED'] },
                currentPeriodEnd: { lt: now },
            },
            include: { plan: true, empresa: true },
        });

        let expired = 0;

        for (const subscription of candidates) {
            if (subscription.empresa.planExempt) continue;
            if (!this.isPastGrace(subscription, now)) continue;

            // Assinatura antiga cancelada não pode cortar uma nova ativa
            // da mesma empresa (cliente que cancelou e reassinou).
            const otherActive = await this.prisma.subscription.count({
                where: {
                    empresaId: subscription.empresaId,
                    status: 'ACTIVE',
                    id: { not: subscription.id },
                },
            });

            if (otherActive > 0) continue;

            await this.prisma.$transaction((tx) =>
                this.expire(tx, subscription),
            );

            expired++;
        }

        if (expired > 0) {
            this.logger.log(
                `${expired} assinatura(s) vencida(s): módulos pagos removidos.`,
            );
        }

        return expired;
    }

    // ------------------------------------------------------------------
    // Visão do Admin Master
    // ------------------------------------------------------------------

    async listSubscriptionsForAdmin() {
        const empresas = await this.prisma.empresa.findMany({
            // Inclui as isentas (Nugalho) de propósito, só pra o Admin poder
            // ver/alterar a flag; a UI esconde liberar/bloquear nelas.
            where: { id: { not: DEMO_EMPRESA_ID } },
            orderBy: { name: 'asc' },
            include: {
                subscriptions: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: { plan: true },
                },
            },
        });

        return empresas.map((empresa) => {
            const subscription = empresa.subscriptions[0] ?? null;

            return {
                empresaId: empresa.id,
                empresaName: empresa.name,
                active: empresa.active,
                planExempt: empresa.planExempt,
                subscription: subscription
                    ? {
                        id: subscription.id,
                        status: subscription.status,
                        planId: subscription.planId,
                        planName: subscription.plan.name,
                        priceCents: subscription.plan.priceCents,
                        currentPeriodEnd: subscription.currentPeriodEnd,
                        modulesBlockedAt: subscription.modulesBlockedAt,
                        viaAsaas: Boolean(subscription.asaasSubscriptionId),
                    }
                    : null,
            };
        });
    }

    // Liberação manual (cortesia, pagamento fora do Asaas, acerto): ativa a
    // empresa por N dias com o plano escolhido e aplica os módulos.
    async grantManually(empresaId: string, dto: GrantSubscriptionDto) {
        const [empresa, plan] = await Promise.all([
            this.prisma.empresa.findUnique({ where: { id: empresaId } }),
            this.prisma.plan.findUnique({ where: { id: dto.planId } }),
        ]);

        if (!empresa) throw new NotFoundException('Empresa não encontrada.');
        if (!plan) throw new NotFoundException('Plano não encontrado.');

        if (empresa.planExempt) {
            throw new BadRequestException(
                'Essa empresa é isenta de plano (sem cobrança).',
            );
        }

        const days = dto.days ?? PERIOD_DAYS;
        const currentPeriodEnd = new Date(Date.now() + days * DAY_MS);

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.subscription.findFirst({
                where: { empresaId, status: { not: 'CANCELED' } },
                orderBy: { createdAt: 'desc' },
            });

            // Se já existe assinatura ligada ao Asaas, mantém o plano dela
            // (o valor cobrado lá não muda) e só estende o prazo.
            const effectivePlanId = existing?.asaasSubscriptionId
                ? existing.planId
                : plan.id;

            const effectivePlan =
                effectivePlanId === plan.id
                    ? plan
                    : await tx.plan.findUniqueOrThrow({
                        where: { id: effectivePlanId },
                    });

            const subscription = existing
                ? await tx.subscription.update({
                    where: { id: existing.id },
                    data: {
                        planId: effectivePlanId,
                        status: 'ACTIVE',
                        currentPeriodEnd,
                        modulesBlockedAt: null,
                    },
                })
                : await tx.subscription.create({
                    data: {
                        empresaId,
                        planId: plan.id,
                        status: 'ACTIVE',
                        currentPeriodEnd,
                    },
                });

            await this.setStoreModules(tx, empresaId, effectivePlan.modules);

            return subscription;
        });
    }

    // Bloqueio manual: remove os módulos já. Um pagamento futuro no Asaas
    // reativa normalmente (quem pagou tem direito).
    async blockManually(empresaId: string) {
        const subscription = await this.prisma.subscription.findFirst({
            where: { empresaId, status: { not: 'CANCELED' } },
            orderBy: { createdAt: 'desc' },
            include: { plan: true, empresa: true },
        });

        if (!subscription) {
            throw new NotFoundException(
                'Essa empresa não tem assinatura. Para tirar módulos de uma empresa sem plano, use Módulos por loja.',
            );
        }

        if (subscription.empresa.planExempt) {
            throw new BadRequestException(
                'Essa empresa é isenta de plano (nunca é bloqueada).',
            );
        }

        await this.prisma.$transaction((tx) => this.expire(tx, subscription));

        return { blocked: true };
    }
}
