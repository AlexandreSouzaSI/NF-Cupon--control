import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CashReconciliationService } from './cash-reconciliation.service';

// Mock mínimo do PrismaService — só os métodos que o service realmente
// chama. Nada de banco de verdade: testa a regra de negócio isolada
// (cálculo de diferença, controle de acesso por loja, montagem do
// upsert), não a integração com Postgres.
function createPrismaMock() {
    return {
        cashReconciliation: {
            upsert: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            delete: jest.fn(),
        },
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

// Usuário restrito a uma única loja (ex: Gerente) — usado pra testar o
// bloqueio de acesso entre lojas.
function gerenteDaLojaA(): any {
    return {
        id: 'user-2',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

describe('CashReconciliationService', () => {
    let service: CashReconciliationService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CashReconciliationService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<CashReconciliationService>(
            CashReconciliationService,
        );
    });

    describe('controle de acesso por loja', () => {
        it('permite Proprietário lançar em qualquer loja', async () => {
            prisma.cashReconciliation.upsert.mockResolvedValue({
                id: 'rec-1',
            });

            await expect(
                service.upsert(
                    {
                        storeId: 'store-qualquer',
                        date: '2026-09-28',
                        systemCash: 100,
                        systemDebit: 0,
                        systemCredit: 0,
                        bankCash: 100,
                        bankDebit: 0,
                        bankCredit: 0,
                    } as any,
                    proprietario(),
                ),
            ).resolves.toEqual({ id: 'rec-1' });
        });

        it('bloqueia Gerente de lançar em loja que não é dele', async () => {
            await expect(
                service.upsert(
                    {
                        storeId: 'store-B',
                        date: '2026-09-28',
                        systemCash: 100,
                        systemDebit: 0,
                        systemCredit: 0,
                        bankCash: 100,
                        bankDebit: 0,
                        bankCredit: 0,
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.cashReconciliation.upsert).not.toHaveBeenCalled();
        });

        it('permite Gerente lançar na própria loja', async () => {
            prisma.cashReconciliation.upsert.mockResolvedValue({
                id: 'rec-2',
            });

            await expect(
                service.upsert(
                    {
                        storeId: 'store-A',
                        date: '2026-09-28',
                        systemCash: 100,
                        systemDebit: 0,
                        systemCredit: 0,
                        bankCash: 100,
                        bankDebit: 0,
                        bankCredit: 0,
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).resolves.toEqual({ id: 'rec-2' });
        });
    });

    describe('upsert — data e campos novos (Outros / Vale-retirada)', () => {
        it('converte a data "AAAA-MM-DD" pro meio-dia UTC (mesmo padrão do resto do projeto)', async () => {
            prisma.cashReconciliation.upsert.mockResolvedValue({});

            await service.upsert(
                {
                    storeId: 'store-A',
                    date: '2026-09-28',
                    systemCash: 100,
                    systemDebit: 0,
                    systemCredit: 0,
                    bankCash: 100,
                    bankDebit: 0,
                    bankCredit: 0,
                } as any,
                proprietario(),
            );

            const call = prisma.cashReconciliation.upsert.mock.calls[0][0];
            expect(call.where.storeId_date.date.toISOString()).toBe(
                '2026-09-28T12:00:00.000Z',
            );
        });

        it('usa 0 como padrão pros campos opcionais (Outros/Vale) quando não informados', async () => {
            prisma.cashReconciliation.upsert.mockResolvedValue({});

            await service.upsert(
                {
                    storeId: 'store-A',
                    date: '2026-09-28',
                    systemCash: 100,
                    systemDebit: 0,
                    systemCredit: 0,
                    bankCash: 100,
                    bankDebit: 0,
                    bankCredit: 0,
                } as any,
                proprietario(),
            );

            const call = prisma.cashReconciliation.upsert.mock.calls[0][0];
            expect(call.create.otherSystem).toBe(0);
            expect(call.create.otherBank).toBe(0);
            expect(call.create.withdrawalAmount).toBe(0);
            expect(call.update.otherSystem).toBe(0);
            expect(call.update.withdrawalAmount).toBe(0);
        });

        it('repassa Outros e Vale/retirada quando informados', async () => {
            prisma.cashReconciliation.upsert.mockResolvedValue({});

            await service.upsert(
                {
                    storeId: 'store-A',
                    date: '2026-09-28',
                    systemCash: 100,
                    systemDebit: 0,
                    systemCredit: 0,
                    bankCash: 100,
                    bankDebit: 0,
                    bankCredit: 0,
                    otherSystem: 50,
                    otherBank: 50,
                    otherDescription: 'Voucher',
                    withdrawalAmount: 30,
                    withdrawalReason: 'Sangria',
                } as any,
                proprietario(),
            );

            const call = prisma.cashReconciliation.upsert.mock.calls[0][0];
            expect(call.create.otherSystem).toBe(50);
            expect(call.create.otherDescription).toBe('Voucher');
            expect(call.create.withdrawalAmount).toBe(30);
            expect(call.create.withdrawalReason).toBe('Sangria');
        });
    });

    describe('findOne', () => {
        it('lança NotFoundException quando o registro não existe', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue(null);

            await expect(
                service.findOne('inexistente', proprietario()),
            ).rejects.toThrow(NotFoundException);
        });

        it('bloqueia acesso a registro de loja que não é do usuário', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue({
                id: 'rec-1',
                storeId: 'store-B',
            });

            await expect(
                service.findOne('rec-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('remove (excluir conciliação salva)', () => {
        it('lança NotFoundException se o registro não existir', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue(null);

            await expect(
                service.remove('inexistente', proprietario()),
            ).rejects.toThrow(NotFoundException);
            expect(prisma.cashReconciliation.delete).not.toHaveBeenCalled();
        });

        it('bloqueia excluir registro de outra loja', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue({
                id: 'rec-1',
                storeId: 'store-B',
            });

            await expect(
                service.remove('rec-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
            expect(prisma.cashReconciliation.delete).not.toHaveBeenCalled();
        });

        it('exclui quando o registro é da loja do usuário', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue({
                id: 'rec-1',
                storeId: 'store-A',
            });
            prisma.cashReconciliation.delete.mockResolvedValue({});

            const result = await service.remove('rec-1', gerenteDaLojaA());

            expect(prisma.cashReconciliation.delete).toHaveBeenCalledWith({
                where: { id: 'rec-1' },
            });
            expect(result).toEqual({ success: true });
        });
    });

    describe('findToday', () => {
        it('busca pela data de hoje convertida pro meio-dia UTC', async () => {
            prisma.cashReconciliation.findUnique.mockResolvedValue(null);

            await service.findToday('store-A', proprietario());

            const call = prisma.cashReconciliation.findUnique.mock.calls[0][0];
            const hojeIso = new Date().toISOString().slice(0, 10);
            expect(call.where.storeId_date.date.toISOString()).toBe(
                `${hojeIso}T12:00:00.000Z`,
            );
        });

        it('bloqueia consulta de loja que não é do usuário', async () => {
            await expect(
                service.findToday('store-B', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });
    });
});
