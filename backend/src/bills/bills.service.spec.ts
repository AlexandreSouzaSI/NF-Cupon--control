import { Test, TestingModule } from '@nestjs/testing';
import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { BillStatus, PurchaseStatus, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsService } from './bills.service';

// Contas a Pagar é o módulo que decide o que sai do caixa/banco de verdade
// — marcar uma conta como paga sem checar acesso por loja, ou deixar
// alguém sem permissão editar/pagar, é dinheiro saindo errado. Testa a
// regra de negócio isolada (permissão, controle de loja, fechamento
// automático de compra, ocultação de contas de folha), sem banco real.
function createPrismaMock() {
    return {
        bill: {
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        purchase: {
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        purchaseHistory: {
            create: jest.fn(),
        },
        store: {
            findUnique: jest.fn(),
        },
        paymentBatchConfig: {
            findFirst: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
        },
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

function gerenteDaLojaA(): any {
    return {
        id: 'user-2',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

// Perfil sem acesso a Contas a Pagar (ex.: Estoquista/Comprador não estão
// em canManageBills) — usado pra testar bloqueio de permissão.
function estoquista(): any {
    return { id: 'user-3', role: UserRole.ESTOQUISTA, userStores: [] };
}

describe('BillsService', () => {
    let service: BillsService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                BillsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<BillsService>(BillsService);
    });

    describe('create — permissão e controle de acesso por loja', () => {
        it('bloqueia perfil sem permissão de gerenciar contas', async () => {
            await expect(
                service.create(
                    { storeId: 'store-A', description: 'x', value: 10, dueDate: '2026-10-01' } as any,
                    estoquista(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.bill.create).not.toHaveBeenCalled();
        });

        it('bloqueia Gerente de lançar conta em loja que não é dele', async () => {
            await expect(
                service.create(
                    { storeId: 'store-B', description: 'x', value: 10, dueDate: '2026-10-01' } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.bill.create).not.toHaveBeenCalled();
        });

        it('converte dueDate "AAAA-MM-DD" pro meio-dia UTC', async () => {
            prisma.bill.create.mockResolvedValue({
                id: 'bill-1',
                value: 100,
                purchaseId: null,
            });

            await service.create(
                {
                    storeId: 'store-A',
                    description: 'Conta teste',
                    value: 100,
                    dueDate: '2026-10-05',
                } as any,
                proprietario(),
            );

            const call = prisma.bill.create.mock.calls[0][0];
            expect(call.data.dueDate.toISOString()).toBe(
                '2026-10-05T12:00:00.000Z',
            );
        });
    });

    describe('create — Fluxo 2: compra sem NF exige descrição dos produtos', () => {
        it('bloqueia gerar conta de compra vinculada sem NF/cupom e sem descrição', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'purchase-1',
                storeId: 'store-A',
                supplierId: 's-1',
                noInvoiceProductsNote: null,
                fiscalDocuments: [],
            });

            await expect(
                service.create(
                    {
                        storeId: 'store-A',
                        description: 'Conta sem NF',
                        value: 50,
                        dueDate: '2026-10-01',
                        purchaseId: 'purchase-1',
                    } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.bill.create).not.toHaveBeenCalled();
        });

        it('permite quando a compra já tem NF/cupom vinculado, mesmo sem descrição', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'purchase-1',
                storeId: 'store-A',
                supplierId: 's-1',
                noInvoiceProductsNote: null,
                fiscalDocuments: [{ type: 'INVOICE' }],
            });
            prisma.bill.create.mockResolvedValue({
                id: 'bill-1',
                value: 50,
                purchaseId: 'purchase-1',
            });

            await expect(
                service.create(
                    {
                        storeId: 'store-A',
                        description: 'Conta com NF',
                        value: 50,
                        dueDate: '2026-10-01',
                        purchaseId: 'purchase-1',
                    } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'bill-1' });
        });

        it('permite quando o usuário informa a descrição dos produtos (Fluxo 2) e persiste na compra', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'purchase-1',
                storeId: 'store-A',
                supplierId: 's-1',
                noInvoiceProductsNote: null,
                fiscalDocuments: [],
            });
            prisma.bill.create.mockResolvedValue({
                id: 'bill-1',
                value: 50,
                purchaseId: 'purchase-1',
            });
            prisma.purchase.update.mockResolvedValue({});
            prisma.purchaseHistory.create.mockResolvedValue({});

            await service.create(
                {
                    storeId: 'store-A',
                    description: 'Conta sem NF',
                    value: 50,
                    dueDate: '2026-10-01',
                    purchaseId: 'purchase-1',
                    noInvoiceProductsNote: 'Compra de hortifruti diverso',
                } as any,
                proprietario(),
            );

            expect(prisma.purchase.update).toHaveBeenCalledWith({
                where: { id: 'purchase-1' },
                data: { noInvoiceProductsNote: 'Compra de hortifruti diverso' },
            });
        });

        it('bloqueia quando a compra vinculada é de outra loja', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'purchase-1',
                storeId: 'store-B',
                supplierId: 's-1',
                noInvoiceProductsNote: null,
                fiscalDocuments: [{ type: 'INVOICE' }],
            });

            await expect(
                service.create(
                    {
                        storeId: 'store-A',
                        description: 'Conta',
                        value: 50,
                        dueDate: '2026-10-01',
                        purchaseId: 'purchase-1',
                    } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('ensureBillAccess — acesso por loja e ocultação de contas de folha', () => {
        it('lança NotFoundException quando a conta não existe', async () => {
            prisma.bill.findUnique.mockResolvedValue(null);

            await expect(
                service.findOne('inexistente', proprietario()),
            ).rejects.toThrow(NotFoundException);
        });

        it('bloqueia acesso a conta de loja que não é do usuário', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-B',
                category: null,
            });

            await expect(
                service.findOne('bill-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('esconde (NotFoundException) conta de categoria Funcionários pra quem não tem canViewPayrollBills', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-A',
                category: { nameNormalized: 'funcionarios' },
            });

            const semAcessoFolha = {
                ...gerenteDaLojaA(),
                canViewPayrollBills: false,
            };

            await expect(
                service.findOne('bill-1', semAcessoFolha),
            ).rejects.toThrow(NotFoundException);
        });

        it('permite ver conta de folha quando canViewPayrollBills não é explicitamente false', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-A',
                category: { nameNormalized: 'funcionarios' },
            });

            await expect(
                service.findOne('bill-1', gerenteDaLojaA()),
            ).resolves.not.toBeNull();
        });
    });

    describe('markAsPaid — regra financeira principal', () => {
        it('bloqueia perfil sem permissão de marcar como paga', async () => {
            await expect(
                service.markAsPaid('bill-1', estoquista()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.bill.update).not.toHaveBeenCalled();
        });

        it('bloqueia marcar como paga uma conta já paga', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-A',
                status: BillStatus.PAID,
                category: null,
            });

            await expect(
                service.markAsPaid('bill-1', proprietario()),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.bill.update).not.toHaveBeenCalled();
        });

        it('marca como paga e NÃO fecha a compra se ainda houver outra conta em aberto', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-A',
                status: BillStatus.OPEN,
                category: null,
                notes: null,
            });
            prisma.bill.update.mockResolvedValue({
                id: 'bill-1',
                value: 100,
                purchaseId: 'purchase-1',
            });
            prisma.purchaseHistory.create.mockResolvedValue({});
            prisma.bill.count.mockResolvedValue(1); // ainda tem 1 conta aberta

            await service.markAsPaid('bill-1', proprietario());

            expect(prisma.purchase.update).not.toHaveBeenCalled();
        });

        it('fecha a compra automaticamente quando essa era a última conta em aberto', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-A',
                status: BillStatus.OPEN,
                category: null,
                notes: null,
            });
            prisma.bill.update.mockResolvedValue({
                id: 'bill-1',
                value: 100,
                purchaseId: 'purchase-1',
            });
            prisma.purchaseHistory.create.mockResolvedValue({});
            prisma.bill.count.mockResolvedValue(0); // nenhuma outra conta em aberto
            prisma.purchase.update.mockResolvedValue({});

            await service.markAsPaid('bill-1', proprietario());

            expect(prisma.purchase.update).toHaveBeenCalledWith({
                where: { id: 'purchase-1' },
                data: expect.objectContaining({
                    status: PurchaseStatus.CLOSED,
                    closedById: 'user-1',
                }),
            });
        });

        it('bloqueia Gerente de marcar como paga conta de loja que não é dele', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-B',
                status: BillStatus.OPEN,
                category: null,
            });

            await expect(
                service.markAsPaid('bill-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.bill.update).not.toHaveBeenCalled();
        });
    });

    describe('toggleQueueToday — fila de pagamento do dia', () => {
        it('bloqueia incluir conta que não está aberta/vencida', async () => {
            prisma.bill.findUnique.mockResolvedValueOnce({
                id: 'bill-1',
                storeId: 'store-A',
                status: BillStatus.PAID,
                category: null,
            });

            await expect(
                service.toggleQueueToday('bill-1', proprietario()),
            ).rejects.toThrow(BadRequestException);
        });
    });

    describe('remove — exclusão só pra Administrativo/Proprietário', () => {
        it('bloqueia Gerente de excluir conta', async () => {
            await expect(
                service.remove('bill-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('permite Proprietário cancelar (soft-delete) a conta', async () => {
            prisma.bill.findUnique.mockResolvedValue({
                id: 'bill-1',
                storeId: 'store-qualquer',
                category: null,
            });
            prisma.bill.update.mockResolvedValue({
                id: 'bill-1',
                status: BillStatus.CANCELED,
            });

            const result = await service.remove('bill-1', proprietario());

            expect(prisma.bill.update).toHaveBeenCalledWith({
                where: { id: 'bill-1' },
                data: { status: BillStatus.CANCELED },
                include: expect.anything(),
            });
            expect(result.status).toBe(BillStatus.CANCELED);
        });
    });

    describe('generateBatchPaymentFile / config do convênio — restrito a Admin/Proprietário', () => {
        it('bloqueia Gerente de ver a configuração do lote', async () => {
            await expect(
                service.getPaymentBatchConfig(gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('bloqueia Gerente de gerar o arquivo de lote', async () => {
            await expect(
                service.generateBatchPaymentFile(gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('exige convênio configurado antes de gerar o lote', async () => {
            prisma.paymentBatchConfig.findFirst.mockResolvedValue(null);

            await expect(
                service.generateBatchPaymentFile(proprietario()),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
