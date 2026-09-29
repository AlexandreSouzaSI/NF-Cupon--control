import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SuppliersService, normalizeSupplierName } from './suppliers.service';

// Fornecedor não tem corte por loja/perfil no service (isso fica no
// controller/guard) — o que importa testar aqui é a regra de negócio real:
// dedupe por nome normalizado, fluxo findOrCreate usado na hora de lançar
// uma compra, e a proteção contra excluir categoria/fornecedor em uso.
function createPrismaMock() {
    return {
        supplier: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            delete: jest.fn(),
        },
        supplierCategory: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            findMany: jest.fn(),
            delete: jest.fn(),
        },
        supplierCategoryLink: {
            deleteMany: jest.fn(),
        },
        supplierStore: {
            deleteMany: jest.fn(),
        },
        quotation: {
            findFirst: jest.fn(),
        },
    };
}

describe('normalizeSupplierName', () => {
    it('remove acentos, espaços duplicados e caixa alta', () => {
        expect(normalizeSupplierName('  Distribuidora   Souza ')).toBe(
            'distribuidora souza',
        );
        expect(normalizeSupplierName('Atacadão')).toBe('atacadao');
    });
});

describe('SuppliersService', () => {
    let service: SuppliersService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SuppliersService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<SuppliersService>(SuppliersService);
    });

    describe('create — dedupe por nome normalizado', () => {
        it('bloqueia nome duplicado (mesmo com acento/caixa diferentes)', async () => {
            prisma.supplier.findUnique.mockResolvedValue({ id: 'existing' });

            await expect(
                service.create({ name: 'Distribuidora Souza' } as any),
            ).rejects.toThrow(ConflictException);

            expect(prisma.supplier.create).not.toHaveBeenCalled();
        });

        it('cria normalmente quando o nome é novo', async () => {
            prisma.supplier.findUnique.mockResolvedValue(null);
            prisma.supplier.create.mockResolvedValue({ id: 's-1' });

            await expect(
                service.create({ name: 'Novo Fornecedor' } as any),
            ).resolves.toMatchObject({ id: 's-1' });

            const createCall = prisma.supplier.create.mock.calls[0][0];
            expect(createCall.data.nameNormalized).toBe('novo fornecedor');
        });
    });

    describe('findOrCreate — usado ao lançar compra', () => {
        it('exige nome não vazio', async () => {
            await expect(service.findOrCreate('   ')).rejects.toThrow(
                BadRequestException,
            );

            expect(prisma.supplier.findUnique).not.toHaveBeenCalled();
        });

        it('reativa fornecedor desativado com o mesmo nome', async () => {
            prisma.supplier.findUnique.mockResolvedValue({
                id: 's-1',
                active: false,
            });
            prisma.supplier.update.mockResolvedValue({ id: 's-1', active: true });

            const result = await service.findOrCreate('Fornecedor X');

            expect(prisma.supplier.update).toHaveBeenCalledWith({
                where: { id: 's-1' },
                data: { active: true },
            });
            expect(result).toMatchObject({ active: true });
        });

        it('retorna o fornecedor existente sem tocar se já ativo', async () => {
            prisma.supplier.findUnique.mockResolvedValue({
                id: 's-1',
                active: true,
            });

            const result = await service.findOrCreate('Fornecedor X');

            expect(prisma.supplier.update).not.toHaveBeenCalled();
            expect(result).toMatchObject({ id: 's-1' });
        });

        it('cria um novo fornecedor quando não existe', async () => {
            prisma.supplier.findUnique.mockResolvedValue(null);
            prisma.supplier.create.mockResolvedValue({ id: 's-2' });

            await service.findOrCreate('Fornecedor Novo');

            expect(prisma.supplier.create).toHaveBeenCalled();
        });
    });

    describe('update — conflito de nome e substituição de vínculos', () => {
        it('lança erro se o fornecedor não existe', async () => {
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(
                service.update('s-x', { name: 'Novo' } as any),
            ).rejects.toThrow(BadRequestException);
        });

        it('bloqueia renomear pra um nome já usado por outro fornecedor', async () => {
            prisma.supplier.findUnique
                .mockResolvedValueOnce({ id: 's-1', nameNormalized: 'antigo' })
                .mockResolvedValueOnce({ id: 's-2', nameNormalized: 'novo nome' });

            await expect(
                service.update('s-1', { name: 'Novo Nome' } as any),
            ).rejects.toThrow(ConflictException);

            expect(prisma.supplier.update).not.toHaveBeenCalled();
        });

        it('permite manter o mesmo nome (sem checar conflito consigo mesmo)', async () => {
            prisma.supplier.findUnique.mockResolvedValueOnce({
                id: 's-1',
                nameNormalized: 'fornecedor x',
            });
            prisma.supplier.update.mockResolvedValue({ id: 's-1' });

            await service.update('s-1', { name: 'Fornecedor X' } as any);

            expect(prisma.supplier.update).toHaveBeenCalled();
        });

        it('substitui a lista inteira de categorias (delete + create)', async () => {
            prisma.supplier.findUnique.mockResolvedValue({
                id: 's-1',
                nameNormalized: 'fornecedor x',
            });
            prisma.supplier.update.mockResolvedValue({ id: 's-1' });

            await service.update('s-1', {
                categoryIds: ['cat-1', 'cat-2'],
            } as any);

            expect(prisma.supplierCategoryLink.deleteMany).toHaveBeenCalledWith({
                where: { supplierId: 's-1' },
            });

            const updateCall = prisma.supplier.update.mock.calls[0][0];
            expect(updateCall.data.categories.create).toEqual([
                { categoryId: 'cat-1' },
                { categoryId: 'cat-2' },
            ]);
        });

        it('storeIds vazio significa "atende todas as lojas" (substitui, não ignora)', async () => {
            prisma.supplier.findUnique.mockResolvedValue({
                id: 's-1',
                nameNormalized: 'fornecedor x',
            });
            prisma.supplier.update.mockResolvedValue({ id: 's-1' });

            await service.update('s-1', { storeIds: [] } as any);

            expect(prisma.supplierStore.deleteMany).toHaveBeenCalledWith({
                where: { supplierId: 's-1' },
            });

            const updateCall = prisma.supplier.update.mock.calls[0][0];
            expect(updateCall.data.stores.create).toEqual([]);
        });
    });

    describe('removeCategory — protege histórico de cotação', () => {
        it('bloqueia excluir categoria já usada em cotação', async () => {
            prisma.quotation.findFirst.mockResolvedValue({ id: 'q-1' });

            await expect(service.removeCategory('cat-1')).rejects.toThrow(
                ConflictException,
            );

            expect(prisma.supplierCategory.delete).not.toHaveBeenCalled();
        });

        it('exclui normalmente quando a categoria nunca foi usada', async () => {
            prisma.quotation.findFirst.mockResolvedValue(null);
            prisma.supplierCategory.delete.mockResolvedValue({});

            await expect(service.removeCategory('cat-1')).resolves.toEqual({
                ok: true,
            });
        });
    });

    describe('remove — exclusão física restrita a Admin Master', () => {
        it('lança erro se o fornecedor não existe', async () => {
            prisma.supplier.findUnique.mockResolvedValue(null);

            await expect(service.remove('s-x')).rejects.toThrow(
                BadRequestException,
            );

            expect(prisma.supplier.delete).not.toHaveBeenCalled();
        });

        it('converte erro de FK (P2003) em mensagem amigável', async () => {
            prisma.supplier.findUnique.mockResolvedValue({ id: 's-1' });
            prisma.supplierCategoryLink.deleteMany.mockResolvedValue({});
            prisma.supplierStore.deleteMany.mockResolvedValue({});
            prisma.supplier.delete.mockRejectedValue({ code: 'P2003' });

            await expect(service.remove('s-1')).rejects.toThrow(
                ConflictException,
            );
        });

        it('exclui normalmente quando não há restrição', async () => {
            prisma.supplier.findUnique.mockResolvedValue({ id: 's-1' });
            prisma.supplierCategoryLink.deleteMany.mockResolvedValue({});
            prisma.supplierStore.deleteMany.mockResolvedValue({});
            prisma.supplier.delete.mockResolvedValue({});

            await expect(service.remove('s-1')).resolves.toEqual({ ok: true });
        });
    });
});
