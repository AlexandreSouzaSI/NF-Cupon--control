import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalRulesService } from './approval-rules.service';

// Regra de aprovação define a partir de qual valor uma compra precisa de
// aprovação, por loja (ou global, quando storeId é nulo). Só quem tem
// acesso global (Administrativo/Proprietário) pode criar regra global ou
// mexer em regra fora da própria loja.
function createPrismaMock() {
    return {
        approvalRule: {
            create: jest.fn(),
            findMany: jest.fn(),
        },
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

function gerenteDaLojaA(): any {
    return {
        id: 'user-3',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

describe('ApprovalRulesService', () => {
    let service: ApprovalRulesService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ApprovalRulesService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<ApprovalRulesService>(ApprovalRulesService);
    });

    describe('create — regra global exige acesso global', () => {
        it('bloqueia Gerente de criar regra sem storeId (global)', async () => {
            await expect(
                service.create(
                    { name: 'Regra Geral', minValue: 100, level: 1 } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.approvalRule.create).not.toHaveBeenCalled();
        });

        it('permite Proprietário criar regra global', async () => {
            prisma.approvalRule.create.mockResolvedValue({ id: 'r-1' });

            await expect(
                service.create(
                    { name: 'Regra Geral', minValue: 100, level: 1 } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'r-1' });
        });
    });

    describe('create — regra por loja exige acesso àquela loja', () => {
        it('bloqueia Gerente de criar regra em loja que não é dele', async () => {
            await expect(
                service.create(
                    {
                        name: 'Regra Loja B',
                        minValue: 100,
                        level: 1,
                        storeId: 'store-B',
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.approvalRule.create).not.toHaveBeenCalled();
        });

        it('permite Gerente criar regra na própria loja', async () => {
            prisma.approvalRule.create.mockResolvedValue({ id: 'r-2' });

            await expect(
                service.create(
                    {
                        name: 'Regra Loja A',
                        minValue: 100,
                        level: 1,
                        storeId: 'store-A',
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).resolves.toMatchObject({ id: 'r-2' });
        });

        it('Proprietário cria regra em qualquer loja', async () => {
            prisma.approvalRule.create.mockResolvedValue({ id: 'r-3' });

            await expect(
                service.create(
                    {
                        name: 'Regra Loja Qualquer',
                        minValue: 100,
                        level: 1,
                        storeId: 'store-qualquer',
                    } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'r-3' });
        });
    });

    describe('findAll — regra global + regras da(s) loja(s) do usuário', () => {
        it('Gerente vê regras globais (storeId null) e da própria loja', async () => {
            prisma.approvalRule.findMany.mockResolvedValue([]);

            await service.findAll(gerenteDaLojaA());

            const call = prisma.approvalRule.findMany.mock.calls[0][0];
            expect(call.where.OR).toEqual([
                { storeId: null },
                { storeId: { in: ['store-A'] } },
            ]);
        });

        it('Proprietário não recebe filtro de loja (vê tudo)', async () => {
            prisma.approvalRule.findMany.mockResolvedValue([]);

            await service.findAll(proprietario());

            const call = prisma.approvalRule.findMany.mock.calls[0][0];
            expect(call.where.OR).toBeUndefined();
        });
    });
});
