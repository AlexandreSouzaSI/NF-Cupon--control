import { Test, TestingModule } from '@nestjs/testing';
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { StoresService } from './stores.service';

// Loja é o eixo de todo o filtro de acesso do sistema: Administrativo e
// Proprietário enxergam/gerenciam qualquer loja, Gerente só as vinculadas a
// ele via userStores. Testa esse corte em findAll/findOne/update e nas
// rotas de certificado, sem tocar banco real.
function createPrismaMock() {
    return {
        store: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        },
        user: {
            findUnique: jest.fn(),
        },
        userStore: {
            upsert: jest.fn(),
            findUnique: jest.fn(),
            delete: jest.fn(),
        },
        storeCertificate: {
            findUnique: jest.fn(),
            upsert: jest.fn(),
            delete: jest.fn(),
            update: jest.fn(),
        },
        sefazSyncLog: {
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

describe('StoresService', () => {
    let service: StoresService;
    let prisma: ReturnType<typeof createPrismaMock>;

    beforeEach(async () => {
        prisma = createPrismaMock();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                StoresService,
                { provide: PrismaService, useValue: prisma },
            ],
        }).compile();

        service = module.get<StoresService>(StoresService);
    });

    describe('findAll — corte por perfil', () => {
        it('Proprietário vê todas as lojas ativas e não-demo', async () => {
            prisma.store.findMany.mockResolvedValue([]);

            await service.findAll(proprietario());

            const call = prisma.store.findMany.mock.calls[0][0];
            expect(call.where.active).toBe(true);
            expect(call.where.isDemo).toBe(false);
            expect(call.where.userStores).toBeUndefined();
        });

        it('Gerente vê só as lojas vinculadas a ele', async () => {
            prisma.store.findMany.mockResolvedValue([]);

            await service.findAll(gerenteDaLojaA());

            const call = prisma.store.findMany.mock.calls[0][0];
            expect(call.where.userStores).toEqual({
                some: { userId: 'user-3' },
            });
        });
    });

    describe('findOne — corte por perfil e NotFound', () => {
        it('Gerente não enxerga loja fora do seu vínculo (findFirst retorna null)', async () => {
            prisma.store.findFirst.mockResolvedValue(null);

            await expect(
                service.findOne('store-B', gerenteDaLojaA()),
            ).rejects.toThrow(NotFoundException);

            const call = prisma.store.findFirst.mock.calls[0][0];
            expect(call.where.userStores).toEqual({
                some: { userId: 'user-3' },
            });
        });

        it('Proprietário não recebe filtro de userStores', async () => {
            prisma.store.findFirst.mockResolvedValue({ id: 'store-A' });

            await service.findOne('store-A', proprietario());

            const call = prisma.store.findFirst.mock.calls[0][0];
            expect(call.where.userStores).toBeUndefined();
        });
    });

    describe('update — existência e acesso gerenciado', () => {
        it('lança NotFound se a loja não existe', async () => {
            prisma.store.findUnique.mockResolvedValue(null);

            await expect(
                service.update('store-X', { name: 'Nova' } as any, proprietario()),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('bloqueia Gerente de editar loja que não é dele', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-B' });

            await expect(
                service.update(
                    'store-B',
                    { name: 'Nova' } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('permite Gerente editar a própria loja', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.store.update.mockResolvedValue({ id: 'store-A', name: 'Nova' });

            await expect(
                service.update(
                    'store-A',
                    { name: 'Nova' } as any,
                    gerenteDaLojaA(),
                ),
            ).resolves.toMatchObject({ id: 'store-A' });
        });
    });

    describe('updateModules — validação de módulo', () => {
        it('rejeita módulo inválido', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });

            await expect(
                service.updateModules('store-A', ['NAO_EXISTE' as StoreModule]),
            ).rejects.toThrow(BadRequestException);

            expect(prisma.store.update).not.toHaveBeenCalled();
        });

        it('aceita lista vazia (desativa todos os módulos)', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.store.update.mockResolvedValue({ id: 'store-A', enabledModules: [] });

            await expect(
                service.updateModules('store-A', []),
            ).resolves.toMatchObject({ id: 'store-A' });
        });
    });

    describe('remove / removeDefinitivo', () => {
        it('remove (soft-delete) marca active=false', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.store.update.mockResolvedValue({ id: 'store-A', active: false });

            await service.remove('store-A');

            const call = prisma.store.update.mock.calls[0][0];
            expect(call.data.active).toBe(false);
        });

        it('removeDefinitivo lança NotFound se a loja não existe', async () => {
            prisma.store.findUnique.mockResolvedValue(null);

            await expect(service.removeDefinitivo('store-X')).rejects.toThrow(
                NotFoundException,
            );
        });

        it('removeDefinitivo converte erro de FK (P2003) em mensagem amigável', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.store.delete.mockRejectedValue({ code: 'P2003' });

            await expect(service.removeDefinitivo('store-A')).rejects.toThrow(
                ConflictException,
            );
        });

        it('removeDefinitivo exclui normalmente quando não há restrição', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.store.delete.mockResolvedValue({});

            await expect(service.removeDefinitivo('store-A')).resolves.toEqual({
                ok: true,
            });
        });
    });

    describe('linkUser / unlinkUser', () => {
        it('linkUser lança NotFound se o usuário não existe', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.linkUser('store-A', 'user-x'),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.userStore.upsert).not.toHaveBeenCalled();
        });

        it('linkUser faz upsert quando loja e usuário existem', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.user.findUnique.mockResolvedValue({ id: 'user-x' });
            prisma.userStore.upsert.mockResolvedValue({});

            await service.linkUser('store-A', 'user-x');

            expect(prisma.userStore.upsert).toHaveBeenCalled();
        });

        it('unlinkUser lança NotFound se o vínculo não existe', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.userStore.findUnique.mockResolvedValue(null);

            await expect(
                service.unlinkUser('store-A', 'user-x'),
            ).rejects.toThrow(NotFoundException);

            expect(prisma.userStore.delete).not.toHaveBeenCalled();
        });
    });

    describe('certificado — acesso gerenciado e validações', () => {
        it('bloqueia Gerente de outra loja de consultar status do certificado', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-B' });

            await expect(
                service.getCertificateStatus('store-B', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('saveCertificate exige arquivo', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });

            await expect(
                service.saveCertificate(
                    'store-A',
                    undefined as any,
                    'senha123',
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('saveCertificate exige senha não vazia', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });

            await expect(
                service.saveCertificate(
                    'store-A',
                    { buffer: Buffer.from(''), originalname: 'cert.pfx' } as any,
                    '   ',
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(BadRequestException);
        });

        it('removeCertificate lança NotFound se não há certificado cadastrado', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A' });
            prisma.storeCertificate.findUnique.mockResolvedValue(null);

            await expect(
                service.removeCertificate('store-A', gerenteDaLojaA()),
            ).rejects.toThrow(NotFoundException);
        });

        it('testGoodsConnection exige CNPJ cadastrado na loja', async () => {
            prisma.store.findUnique.mockResolvedValue({ id: 'store-A', cnpj: null });

            await expect(
                service.testGoodsConnection('store-A', gerenteDaLojaA()),
            ).rejects.toThrow(BadRequestException);
        });

        it('testGoodsConnection exige UF cadastrada na loja', async () => {
            prisma.store.findUnique.mockResolvedValue({
                id: 'store-A',
                cnpj: '12345678000100',
                uf: null,
            });

            await expect(
                service.testGoodsConnection('store-A', gerenteDaLojaA()),
            ).rejects.toThrow(BadRequestException);
        });
    });
});
