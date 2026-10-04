import { Test, TestingModule } from '@nestjs/testing';
import { StoreModule } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AsaasClient } from './asaas.client';
import { BillingService } from './billing.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { DAY_MS, GRACE_DAYS, PERIOD_DAYS } from './billing.constants';

// Cobre o coração financeiro: pagamento confirmado libera módulos (uma vez
// só, mesmo com webhook repetido), teste grátis vira conta real, vencimento
// respeita a tolerância e empresas isentas nunca são bloqueadas. Prisma e
// Asaas mockados — nada toca banco nem rede.
function createPrismaMock() {
    const prisma: any = {
        subscription: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        subscriptionPayment: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            count: jest.fn(),
        },
        store: {
            findMany: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        user: { findUnique: jest.fn(), update: jest.fn() },
        empresa: { update: jest.fn() },
    };

    // A transação roda o callback com o próprio mock como "tx".
    prisma.$transaction = jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    );

    return prisma;
}

function buildSubscription(overrides: any = {}) {
    return {
        id: 'sub-1',
        empresaId: 'emp-1',
        planId: 'plan-1',
        status: 'PENDING',
        currentPeriodEnd: null,
        asaasSubscriptionId: 'sub_asaas_1',
        trialUserId: null,
        modulesBlockedAt: null,
        plan: {
            id: 'plan-1',
            modules: [StoreModule.COMPRAS, StoreModule.CONTAS_A_PAGAR],
        },
        empresa: { id: 'emp-1', name: 'Bar do Zé', planExempt: false },
        ...overrides,
    };
}

const paymentReceived = {
    id: 'pay_1',
    subscription: 'sub_asaas_1',
    value: 99.9,
    status: 'RECEIVED',
    billingType: 'PIX',
    dueDate: '2026-10-04',
    paymentDate: '2026-10-04',
    invoiceUrl: 'https://asaas.test/i/1',
};

describe('BillingService', () => {
    let service: BillingService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillingService,
                { provide: PrismaService, useValue: prisma },
                {
                    provide: AsaasClient,
                    useValue: { isConfigured: () => true },
                },
            ],
        }).compile();

        service = module.get(BillingService);

        prisma.store.findMany.mockResolvedValue([
            { id: 'store-1', tipoPessoa: 'JURIDICA' },
            { id: 'store-2', tipoPessoa: 'FISICA' },
        ]);
    });

    describe('applyPayment', () => {
        it('ignora cobrança que não é de assinatura nossa', async () => {
            prisma.subscription.findUnique.mockResolvedValue(null);

            const result = await service.applyPayment(
                'PAYMENT_RECEIVED',
                paymentReceived,
            );

            expect(result).toEqual({ ignored: true });
            expect(prisma.subscriptionPayment.upsert).not.toHaveBeenCalled();
        });

        it('pagamento confirmado ativa por 30 dias e libera os módulos do plano', async () => {
            const subscription = buildSubscription();
            prisma.subscription.findUnique.mockResolvedValue(subscription);
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

            const before = Date.now();
            const result = await service.applyPayment(
                'PAYMENT_RECEIVED',
                paymentReceived,
            );

            expect(result).toEqual({ activated: true });

            const update = prisma.subscription.update.mock.calls[0][0];
            expect(update.data.status).toBe('ACTIVE');
            expect(update.data.modulesBlockedAt).toBeNull();

            const end = update.data.currentPeriodEnd.getTime();
            expect(end).toBeGreaterThanOrEqual(before + PERIOD_DAYS * DAY_MS);

            // Loja jurídica recebe o plano todo; loja Pessoa Física segue
            // limitada a Contas a Pagar.
            const byStore = Object.fromEntries(
                prisma.store.update.mock.calls.map((call: any) => [
                    call[0].where.id,
                    call[0].data.enabledModules,
                ]),
            );
            expect(byStore['store-1']).toEqual([
                StoreModule.COMPRAS,
                StoreModule.CONTAS_A_PAGAR,
            ]);
            expect(byStore['store-2']).toEqual([StoreModule.CONTAS_A_PAGAR]);
        });

        it('webhook repetido (cobrança já paga) não prorroga de novo', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(Date.now() + 10 * DAY_MS),
                }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue({
                asaasPaymentId: 'pay_1',
                status: 'RECEIVED',
                paidAt: new Date(),
                invoiceUrl: null,
            });

            const result = await service.applyPayment(
                'PAYMENT_RECEIVED',
                paymentReceived,
            );

            expect(result).toEqual({ recorded: true });
            expect(prisma.subscription.update).not.toHaveBeenCalled();
            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('renovação adiantada soma 30 dias ao fim do período vigente', async () => {
            const currentEnd = new Date(Date.now() + 10 * DAY_MS);
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({
                    status: 'ACTIVE',
                    currentPeriodEnd: currentEnd,
                }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

            await service.applyPayment('PAYMENT_CONFIRMED', {
                ...paymentReceived,
                id: 'pay_2',
            });

            const update = prisma.subscription.update.mock.calls[0][0];
            expect(update.data.currentPeriodEnd.getTime()).toBe(
                currentEnd.getTime() + PERIOD_DAYS * DAY_MS,
            );
        });

        it('primeiro pagamento de conta de teste converte teste em conta real', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({ trialUserId: 'user-demo' }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);
            prisma.user.findUnique.mockResolvedValue({
                id: 'user-demo',
                isDemo: true,
                userStores: [
                    { storeId: 'store-demo', store: { isDemo: true } },
                ],
            });

            await service.applyPayment('PAYMENT_RECEIVED', paymentReceived);

            expect(prisma.store.updateMany).toHaveBeenCalledWith({
                where: { id: { in: ['store-demo'] } },
                data: expect.objectContaining({
                    empresaId: 'emp-1',
                    isDemo: false,
                    active: true,
                }),
            });
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'user-demo' },
                data: expect.objectContaining({
                    isDemo: false,
                    demoExpiresAt: null,
                    empresaId: 'emp-1',
                    role: 'PROPRIETARIO',
                }),
            });
        });

        it('pagamento de assinatura cancelada é registrado mas não reabre acesso', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({ status: 'CANCELED' }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

            const result = await service.applyPayment(
                'PAYMENT_RECEIVED',
                paymentReceived,
            );

            expect(result).toEqual({ recorded: true });
            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('PAYMENT_OVERDUE dentro da tolerância não bloqueia', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({
                    status: 'ACTIVE',
                    // venceu ontem: ainda dentro dos 3 dias de tolerância
                    currentPeriodEnd: new Date(Date.now() - 1 * DAY_MS),
                }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

            const result = await service.applyPayment('PAYMENT_OVERDUE', {
                ...paymentReceived,
                status: 'OVERDUE',
            });

            expect(result).toEqual({ recorded: true });
            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('PAYMENT_OVERDUE depois da tolerância vira PAST_DUE e remove os módulos', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(
                        Date.now() - (GRACE_DAYS + 1) * DAY_MS,
                    ),
                }),
            );
            prisma.subscriptionPayment.findUnique.mockResolvedValue(null);

            const result = await service.applyPayment('PAYMENT_OVERDUE', {
                ...paymentReceived,
                status: 'OVERDUE',
            });

            expect(result).toEqual({ expired: true });
            expect(
                prisma.subscription.update.mock.calls[0][0].data.status,
            ).toBe('PAST_DUE');

            for (const call of prisma.store.update.mock.calls) {
                expect(call[0].data.enabledModules).toEqual([]);
            }
        });
    });

    describe('handleWebhook', () => {
        it('ignora evento desconhecido e payload vazio', async () => {
            expect(await service.handleWebhook({})).toEqual({ ignored: true });
            expect(
                await service.handleWebhook({ event: 'ALGO_NOVO' }),
            ).toEqual({ ignored: true });
        });

        it('SUBSCRIPTION_DELETED marca CANCELED', async () => {
            prisma.subscription.findUnique.mockResolvedValue(
                buildSubscription({ status: 'ACTIVE' }),
            );

            await service.handleWebhook({
                event: 'SUBSCRIPTION_DELETED',
                subscription: { id: 'sub_asaas_1' },
            });

            expect(prisma.subscription.update).toHaveBeenCalledWith({
                where: { id: 'sub-1' },
                data: { status: 'CANCELED' },
            });
        });
    });

    describe('expireDueSubscriptions (cron)', () => {
        it('bloqueia só quem passou da tolerância e pula empresa isenta', async () => {
            const now = new Date();

            prisma.subscription.findMany.mockResolvedValue([
                buildSubscription({
                    id: 'vencida',
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(
                        now.getTime() - (GRACE_DAYS + 1) * DAY_MS,
                    ),
                }),
                buildSubscription({
                    id: 'na-tolerancia',
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(now.getTime() - 1 * DAY_MS),
                }),
                buildSubscription({
                    id: 'isenta',
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(now.getTime() - 30 * DAY_MS),
                    empresa: { id: 'nugalho', planExempt: true },
                }),
            ]);
            prisma.subscription.count.mockResolvedValue(0);

            const expired = await service.expireDueSubscriptions(now);

            expect(expired).toBe(1);
            expect(prisma.subscription.update).toHaveBeenCalledTimes(1);
            expect(prisma.subscription.update.mock.calls[0][0].where.id).toBe(
                'vencida',
            );
        });

        it('assinatura cancelada antiga não corta uma nova ativa da mesma empresa', async () => {
            const now = new Date();

            prisma.subscription.findMany.mockResolvedValue([
                buildSubscription({
                    status: 'CANCELED',
                    currentPeriodEnd: new Date(now.getTime() - 2 * DAY_MS),
                }),
            ]);
            prisma.subscription.count.mockResolvedValue(1);

            expect(await service.expireDueSubscriptions(now)).toBe(0);
            expect(prisma.store.update).not.toHaveBeenCalled();
        });
    });

    describe('getMe', () => {
        it('Admin Master e empresa planExempt são isentos (sem CTA de planos)', async () => {
            expect(
                await service.getMe({ id: 'u', isAdminMaster: true }),
            ).toEqual({ exempt: true, reason: 'ADMIN_MASTER' });

            (prisma as any).empresa.findUnique = jest
                .fn()
                .mockResolvedValue({ id: 'nugalho', planExempt: true });

            expect(
                await service.getMe({ id: 'u', empresaId: 'nugalho' }),
            ).toEqual({ exempt: true, reason: 'PLAN_EXEMPT' });
        });
    });
});

describe('BillingWebhookController', () => {
    const OLD_ENV = process.env;
    let controller: BillingWebhookController;
    const billingService = { handleWebhook: jest.fn() };

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        billingService.handleWebhook.mockReset().mockResolvedValue({ ok: 1 });
        controller = new BillingWebhookController(billingService as any);
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('fica desligado (503) sem ASAAS_WEBHOOK_TOKEN', async () => {
        delete process.env.ASAAS_WEBHOOK_TOKEN;

        await expect(controller.webhook({}, 'x')).rejects.toThrow(
            /não configurado/,
        );
    });

    it('recusa token ausente ou errado', async () => {
        process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';

        await expect(controller.webhook({}, undefined)).rejects.toThrow(
            /Token inválido/,
        );
        await expect(controller.webhook({}, 'errado')).rejects.toThrow(
            /Token inválido/,
        );
        expect(billingService.handleWebhook).not.toHaveBeenCalled();
    });

    it('aceita o token certo e repassa o evento', async () => {
        process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';

        await expect(
            controller.webhook({ event: 'PAYMENT_RECEIVED' }, 'segredo'),
        ).resolves.toEqual({ ok: 1 });
    });
});
