import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import {
    ApprovalStatus,
    PurchaseCategory,
    PurchaseStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { BillsService } from '../bills/bills.service';
import { BillCategoriesService } from '../bill-categories/bill-categories.service';
import { PurchasesService } from './purchases.service';

// Compras é o módulo de maior risco financeiro do sistema — errar controle
// de acesso por loja ou a regra de aprovação aqui deixa passar compra sem
// aprovação, ou vaza dado de uma loja pra outro Gerente. Testa só a regra de
// negócio (permissão, transição de status, controle de loja), sem tocar em
// banco de verdade.
function createPrismaMock() {
    return {
        purchase: {
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        // createHistory() e generateAlertsForPurchase() são chamados a
        // cada create/approve/reject — sem mockar aqui, qualquer teste
        // desses fluxos quebra com "Cannot read properties of undefined".
        purchaseHistory: {
            create: jest.fn().mockResolvedValue({}),
        },
        purchaseAlert: {
            createMany: jest.fn().mockResolvedValue({}),
        },
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

function compradorSemLoja(): any {
    return { id: 'user-2', role: UserRole.COMPRADOR, userStores: [] };
}

function gerenteDaLojaA(): any {
    return {
        id: 'user-3',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

// Funcionário comum (sem canApprovePurchases) — não pode aprovar/reprovar,
// mas também não deveria conseguir nem criar compra (canCreatePurchase é
// restrito a um grupo de perfis).
function funcionarioComum(): any {
    return { id: 'user-4', role: UserRole.FUNCIONARIO, userStores: [] };
}

describe('PurchasesService', () => {
    let service: PurchasesService;
    let prisma: ReturnType<typeof createPrismaMock>;
    let notificationsService: { notifyStoreAccess: jest.Mock };

    beforeEach(async () => {
        prisma = createPrismaMock();
        notificationsService = { notifyStoreAccess: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PurchasesService,
                { provide: PrismaService, useValue: prisma },
                { provide: NotificationsService, useValue: notificationsService },
                { provide: SuppliersService, useValue: {} },
                { provide: BillsService, useValue: {} },
                { provide: BillCategoriesService, useValue: {} },
            ],
        }).compile();

        service = module.get<PurchasesService>(PurchasesService);
    });

    describe('create — permissão e controle de acesso por loja', () => {
        it('bloqueia quem não tem perfil autorizado a cadastrar compra', async () => {
            await expect(
                service.create(
                    { storeId: 'store-A', description: 'x', value: 10 } as any,
                    funcionarioComum(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.create).not.toHaveBeenCalled();
        });

        it('bloqueia Gerente de cadastrar compra em loja que não é dele', async () => {
            await expect(
                service.create(
                    { storeId: 'store-B', description: 'x', value: 10 } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.create).not.toHaveBeenCalled();
        });

        it('permite Proprietário cadastrar em qualquer loja', async () => {
            prisma.purchase.create.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                description: 'Compra teste',
                value: 100,
            });

            await expect(
                service.create(
                    {
                        storeId: 'store-qualquer',
                        description: 'Compra teste',
                        value: 100,
                        category: PurchaseCategory.SUPPLIER_ORDER,
                    } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'p-1' });

            expect(notificationsService.notifyStoreAccess).toHaveBeenCalled();
        });
    });

    describe('regra de aprovação por categoria (getInitialStatus/shouldRequireApproval)', () => {
        it('pedido com fornecedor (SUPPLIER_ORDER) nunca passa por aprovação — vai direto pra aguardando recebimento', async () => {
            prisma.purchase.create.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-A',
                description: 'Pedido fornecedor',
                value: 50,
                method: 'PIX',
            });

            await service.create(
                {
                    storeId: 'store-A',
                    description: 'Pedido fornecedor',
                    value: 50,
                    category: PurchaseCategory.SUPPLIER_ORDER,
                } as any,
                proprietario(),
            );

            const call = prisma.purchase.create.mock.calls[0][0];
            expect(call.data.requiresApproval).toBe(false);
            expect(call.data.status).toBe(PurchaseStatus.WAITING_RECEIPT);
        });

        it('compra avulsa no cartão exige aprovação e fica Aguardando aprovação', async () => {
            prisma.purchase.create.mockResolvedValue({
                id: 'p-2',
                storeId: 'store-A',
                description: 'Compra avulsa cartão',
                value: 30,
                method: 'CREDIT_CARD',
            });

            await service.create(
                {
                    storeId: 'store-A',
                    description: 'Compra avulsa cartão',
                    value: 30,
                    category: PurchaseCategory.AVULSA_CARD,
                } as any,
                proprietario(),
            );

            const call = prisma.purchase.create.mock.calls[0][0];
            expect(call.data.requiresApproval).toBe(true);
            expect(call.data.status).toBe(PurchaseStatus.WAITING_APPROVAL);
        });

        it('compra Online também exige aprovação', async () => {
            prisma.purchase.create.mockResolvedValue({
                id: 'p-3',
                storeId: 'store-A',
                description: 'Compra online',
                value: 30,
                method: 'PIX',
            });

            await service.create(
                {
                    storeId: 'store-A',
                    description: 'Compra online',
                    value: 30,
                    category: PurchaseCategory.ONLINE_MARKETPLACE,
                } as any,
                proprietario(),
            );

            const call = prisma.purchase.create.mock.calls[0][0];
            expect(call.data.requiresApproval).toBe(true);
            expect(call.data.status).toBe(PurchaseStatus.WAITING_APPROVAL);
        });
    });

    describe('findAll — filtro de loja e status', () => {
        it('bloqueia quem não pode acessar Compras', async () => {
            await expect(
                service.findAll(funcionarioComum()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('bloqueia consultar loja fora do próprio acesso', async () => {
            await expect(
                service.findAll(gerenteDaLojaA(), { storeId: 'store-B' }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('sem paginação, filtra por status "notIn: [WAITING_APPROVAL, REJECTED]" quando status não é informado', async () => {
            prisma.purchase.findMany.mockResolvedValue([]);

            await service.findAll(proprietario());

            const call = prisma.purchase.findMany.mock.calls[0][0];
            expect(call.where.status).toEqual({
                notIn: [PurchaseStatus.WAITING_APPROVAL, PurchaseStatus.REJECTED],
            });
        });

        it('restringe às lojas do usuário quando o perfil não tem acesso global', async () => {
            prisma.purchase.findMany.mockResolvedValue([]);

            await service.findAll(gerenteDaLojaA());

            const call = prisma.purchase.findMany.mock.calls[0][0];
            expect(call.where.storeId).toEqual({ in: ['store-A'] });
        });
    });

    describe('approve/reject — permissão e transição de status', () => {
        it('bloqueia Comprador sem userStores vinculado a aprovar (mas o role já dá permissão de aprovar por padrão)', async () => {
            // Comprador está no grupo com acesso total (canApprovePurchase),
            // então aqui testamos que mesmo tendo permissão de aprovar, é
            // bloqueado se a compra for de loja fora do seu acesso.
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-B',
                status: PurchaseStatus.WAITING_APPROVAL,
            });

            const comprador = {
                id: 'user-5',
                role: UserRole.COMPRADOR,
                userStores: [{ storeId: 'store-A' }],
            };

            // Comprador é do grupo com acesso total ao módulo, mas
            // ensurePurchaseAccess ainda filtra por getAllowedStoreIds —
            // como COMPRADOR não está em [ADMINISTRATIVO, PROPRIETARIO],
            // ele tem lista restrita de lojas.
            await expect(
                service.approve('p-1', comprador),
            ).rejects.toThrow(ForbiddenException);
        });

        it('bloqueia perfil sem permissão de aprovar (Gerente sem canApprovePurchases)', async () => {
            await expect(
                service.approve('p-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.update).not.toHaveBeenCalled();
        });

        it('permite Gerente aprovar quando tem canApprovePurchases=true', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-A',
                status: PurchaseStatus.WAITING_APPROVAL,
            });
            prisma.purchase.update
                .mockResolvedValueOnce({
                    id: 'p-1',
                    storeId: 'store-A',
                    description: 'Compra',
                    category: PurchaseCategory.AVULSA_CARD,
                })
                .mockResolvedValueOnce({ id: 'p-1', status: PurchaseStatus.RECEIVED_OK });

            const gerenteComPermissao = {
                id: 'user-6',
                role: UserRole.GERENTE,
                userStores: [{ storeId: 'store-A' }],
                canApprovePurchases: true,
            };

            await service.approve('p-1', gerenteComPermissao);

            expect(prisma.purchase.update).toHaveBeenCalledTimes(2);
        });

        it('bloqueia aprovar compra que não está aguardando aprovação', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.APPROVED,
            });

            await expect(
                service.approve('p-1', proprietario()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.update).not.toHaveBeenCalled();
        });

        it('approve() define status seguinte conforme categoria: AVULSA_CARD -> RECEIVED_OK, demais -> WAITING_RECEIPT', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.WAITING_APPROVAL,
            });
            prisma.purchase.update
                .mockResolvedValueOnce({
                    id: 'p-1',
                    storeId: 'store-qualquer',
                    description: 'Compra',
                    category: PurchaseCategory.ONLINE_MARKETPLACE,
                })
                .mockResolvedValueOnce({ id: 'p-1', status: PurchaseStatus.WAITING_RECEIPT });

            await service.approve('p-1', proprietario());

            const secondCall = prisma.purchase.update.mock.calls[1][0];
            expect(secondCall.data.status).toBe(PurchaseStatus.WAITING_RECEIPT);
        });

        it('approve() de AVULSA_CARD vai direto pra RECEIVED_OK (não tem etapa de receber)', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.WAITING_APPROVAL,
            });
            prisma.purchase.update
                .mockResolvedValueOnce({
                    id: 'p-1',
                    storeId: 'store-qualquer',
                    description: 'Compra avulsa cartão',
                    category: PurchaseCategory.AVULSA_CARD,
                })
                .mockResolvedValueOnce({ id: 'p-1', status: PurchaseStatus.RECEIVED_OK });

            await service.approve('p-1', proprietario());

            const secondCall = prisma.purchase.update.mock.calls[1][0];
            expect(secondCall.data.status).toBe(PurchaseStatus.RECEIVED_OK);
        });

        it('reject() marca REJECTED e registra motivo', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.WAITING_APPROVAL,
            });
            prisma.purchase.update.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                description: 'Compra',
                status: PurchaseStatus.REJECTED,
            });

            await service.reject('p-1', proprietario(), 'Preço acima do mercado');

            const call = prisma.purchase.update.mock.calls[0][0];
            expect(call.data.status).toBe(PurchaseStatus.REJECTED);
            expect(call.data.rejectionReason).toBe('Preço acima do mercado');
            expect(call.data.approvals.create.status).toBe(
                ApprovalStatus.REJECTED,
            );
        });

        it('bloqueia reprovar compra que não está aguardando aprovação', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.REJECTED,
            });

            await expect(
                service.reject('p-1', proprietario()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.update).not.toHaveBeenCalled();
        });
    });

    describe('remove — exclusão definitiva só de compra reprovada', () => {
        it('bloqueia excluir compra que não está reprovada', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.WAITING_RECEIPT,
                bills: [],
                incomingGoodsNfs: [],
            });

            await expect(
                service.remove('p-1', proprietario()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.delete).not.toHaveBeenCalled();
        });

        it('bloqueia excluir compra reprovada que já tem conta ou NF vinculada', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.REJECTED,
                bills: [{ id: 'bill-1' }],
                incomingGoodsNfs: [],
            });

            await expect(
                service.remove('p-1', proprietario()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.purchase.delete).not.toHaveBeenCalled();
        });

        it('exclui compra reprovada sem vínculo nenhum', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-qualquer',
                status: PurchaseStatus.REJECTED,
                bills: [],
                incomingGoodsNfs: [],
            });
            prisma.purchase.delete.mockResolvedValue({});

            const result = await service.remove('p-1', proprietario());

            expect(prisma.purchase.delete).toHaveBeenCalledWith({
                where: { id: 'p-1' },
            });
            expect(result).toEqual({ deleted: true });
        });

        it('bloqueia Gerente de excluir compra de loja que não é dele', async () => {
            prisma.purchase.findUnique.mockResolvedValue({
                id: 'p-1',
                storeId: 'store-B',
                status: PurchaseStatus.REJECTED,
                bills: [],
                incomingGoodsNfs: [],
            });

            await expect(
                service.remove('p-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });
    });
});
