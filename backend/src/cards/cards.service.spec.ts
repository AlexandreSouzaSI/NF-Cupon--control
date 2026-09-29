import { Test, TestingModule } from '@nestjs/testing';
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CardsService } from './cards.service';

// Cartão pertence a uma loja; Gerente/Funcionário só podem criar, listar e
// desativar cartões das lojas às quais estão vinculados. Testa esse corte
// isolado, sem banco real.
function createPrismaMock() {
    return {
        card: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
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

describe('CardsService', () => {
    let service: CardsService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                CardsService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<CardsService>(CardsService);
    });

    describe('create — acesso por loja', () => {
        it('bloqueia Gerente de criar cartão em loja que não é dele', async () => {
            await expect(
                service.create(
                    { storeId: 'store-B', name: 'Cartão X' } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.card.create).not.toHaveBeenCalled();
        });

        it('permite Gerente criar cartão na própria loja', async () => {
            prisma.card.create.mockResolvedValue({ id: 'c-1' });

            await expect(
                service.create(
                    { storeId: 'store-A', name: 'Cartão X' } as any,
                    gerenteDaLojaA(),
                ),
            ).resolves.toMatchObject({ id: 'c-1' });
        });

        it('Proprietário cria em qualquer loja', async () => {
            prisma.card.create.mockResolvedValue({ id: 'c-2' });

            await expect(
                service.create(
                    { storeId: 'store-qualquer', name: 'Cartão Y' } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'c-2' });
        });
    });

    describe('findAll — filtro por loja', () => {
        it('Gerente só vê cartões das lojas vinculadas', async () => {
            prisma.card.findMany.mockResolvedValue([]);

            await service.findAll(gerenteDaLojaA());

            const call = prisma.card.findMany.mock.calls[0][0];
            expect(call.where.storeId).toEqual({ in: ['store-A'] });
        });

        it('Proprietário não recebe filtro de loja', async () => {
            prisma.card.findMany.mockResolvedValue([]);

            await service.findAll(proprietario());

            const call = prisma.card.findMany.mock.calls[0][0];
            expect(call.where.storeId).toBeUndefined();
        });
    });

    describe('remove — desativação com corte de acesso', () => {
        it('lança NotFound se o cartão não existe', async () => {
            prisma.card.findUnique.mockResolvedValue(null);

            await expect(
                service.remove('c-x', proprietario()),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.card.update).not.toHaveBeenCalled();
        });

        it('bloqueia Gerente de desativar cartão de loja que não é dele', async () => {
            prisma.card.findUnique.mockResolvedValue({
                id: 'c-1',
                storeId: 'store-B',
            });

            await expect(
                service.remove('c-1', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.card.update).not.toHaveBeenCalled();
        });

        it('permite Gerente desativar cartão da própria loja', async () => {
            prisma.card.findUnique.mockResolvedValue({
                id: 'c-1',
                storeId: 'store-A',
            });
            prisma.card.update.mockResolvedValue({ id: 'c-1', active: false });

            await service.remove('c-1', gerenteDaLojaA());

            const call = prisma.card.update.mock.calls[0][0];
            expect(call.data.active).toBe(false);
        });
    });

    describe('removeDefinitivo — exclusão física restrita a Admin Master', () => {
        it('lança NotFound se o cartão não existe', async () => {
            prisma.card.findUnique.mockResolvedValue(null);

            await expect(service.removeDefinitivo('c-x')).rejects.toThrow(
                NotFoundException,
            );
        });

        it('converte erro de FK (P2003) em mensagem amigável', async () => {
            prisma.card.findUnique.mockResolvedValue({ id: 'c-1' });
            prisma.card.delete.mockRejectedValue({ code: 'P2003' });

            await expect(service.removeDefinitivo('c-1')).rejects.toThrow(
                ConflictException,
            );
        });

        it('exclui normalmente quando não há restrição', async () => {
            prisma.card.findUnique.mockResolvedValue({ id: 'c-1' });
            prisma.card.delete.mockResolvedValue({});

            await expect(service.removeDefinitivo('c-1')).resolves.toEqual({
                ok: true,
            });
        });
    });
});
