import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

// Cadastro de usuário é a porta de entrada de todo o resto do sistema de
// permissões: quem pode criar/editar/desativar alguém com qual perfil, em
// qual loja, e quem pode conceder poderes extras (aprovar compra, ver
// contas de folha, liberar módulo). Testa a matriz ROLE_ASSIGNERS e as
// checagens de loja/permissão especial isoladas, sem banco real.
function createPrismaMock() {
    return {
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
        },
        userStore: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
        },
        $transaction: jest.fn(),
    };
}

function proprietario(): any {
    return { id: 'user-1', role: UserRole.PROPRIETARIO };
}

function administrativo(): any {
    return { id: 'user-2', role: UserRole.ADMINISTRATIVO };
}

function gerenteDaLojaA(): any {
    return {
        id: 'user-3',
        role: UserRole.GERENTE,
        userStores: [{ storeId: 'store-A' }],
    };
}

function adminMaster(): any {
    return { id: 'user-4', role: UserRole.PROPRIETARIO, isAdminMaster: true };
}

describe('UsersService', () => {
    let service: UsersService;
    let prisma: ReturnType<typeof createPrismaMock>;
    let eventEmitter: { emit: jest.Mock };

    beforeEach(async () => {
        prisma = createPrismaMock();
        eventEmitter = { emit: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                UsersService,
                { provide: PrismaService, useValue: prisma },
                { provide: EventEmitter2, useValue: eventEmitter },
            ],
        }).compile();

        service = module.get<UsersService>(UsersService);
    });

    describe('matriz de perfil-alvo (ROLE_ASSIGNERS) — via create()', () => {
        it('bloqueia Administrativo de criar outro Proprietário', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'novo@x.com',
                        name: 'Novo',
                        password: 'senha123',
                        role: UserRole.PROPRIETARIO,
                    } as any,
                    administrativo(),
                ),
            ).rejects.toThrow(ForbiddenException);

            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it('permite Proprietário criar outro Proprietário', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({ id: 'u-1' });

            await expect(
                service.create(
                    {
                        email: 'novo@x.com',
                        name: 'Novo',
                        password: 'senha123',
                        role: UserRole.PROPRIETARIO,
                    } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'u-1' });
        });

        it('bloqueia Gerente de criar um Administrativo', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'novo@x.com',
                        name: 'Novo',
                        password: 'senha123',
                        role: UserRole.ADMINISTRATIVO,
                        storeIds: ['store-A'],
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('permite Gerente criar um Funcionário na própria loja', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({ id: 'u-2' });

            await expect(
                service.create(
                    {
                        email: 'func@x.com',
                        name: 'Funcionário',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                        storeIds: ['store-A'],
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).resolves.toMatchObject({ id: 'u-2' });
        });

        it('bloqueia Gerente de criar Funcionário em loja que não é dele', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'func@x.com',
                        name: 'Funcionário',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                        storeIds: ['store-B'],
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('Admin Master sempre pode, independente da matriz', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({ id: 'u-3' });

            await expect(
                service.create(
                    {
                        email: 'outro@x.com',
                        name: 'Outro Proprietário',
                        password: 'senha123',
                        role: UserRole.PROPRIETARIO,
                    } as any,
                    adminMaster(),
                ),
            ).resolves.toMatchObject({ id: 'u-3' });
        });
    });

    describe('create() — duplicidade e fluxo de convite', () => {
        it('bloqueia e-mail já cadastrado', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

            await expect(
                service.create(
                    {
                        email: 'existe@x.com',
                        name: 'X',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                    } as any,
                    proprietario(),
                ),
            ).rejects.toThrow(ConflictException);

            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it('exige telefone quando não informa senha (fluxo de convite)', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'convite@x.com',
                        name: 'Convidado',
                        role: UserRole.FUNCIONARIO,
                    } as any,
                    proprietario(),
                ),
            ).rejects.toThrow('Informe o telefone');

            expect(prisma.user.create).not.toHaveBeenCalled();
        });

        it('convite com telefone dispara evento de ativação por WhatsApp', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({
                id: 'u-4',
                name: 'Convidado',
            });

            await service.create(
                {
                    email: 'convite@x.com',
                    name: 'Convidado',
                    phone: '31999998888',
                    role: UserRole.FUNCIONARIO,
                } as any,
                proprietario(),
            );

            expect(eventEmitter.emit).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ userId: 'u-4' }),
            );

            const createCall = prisma.user.create.mock.calls[0][0];
            expect(createCall.data.accountActivated).toBe(false);
        });

        it('com senha informada, não é fluxo de convite (accountActivated=true)', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({ id: 'u-5' });

            await service.create(
                {
                    email: 'comsenha@x.com',
                    name: 'Com Senha',
                    password: 'senha123',
                    role: UserRole.FUNCIONARIO,
                } as any,
                proprietario(),
            );

            const createCall = prisma.user.create.mock.calls[0][0];
            expect(createCall.data.accountActivated).toBe(true);
            expect(eventEmitter.emit).not.toHaveBeenCalled();
        });
    });

    describe('permissões especiais — aprovar compra e módulos', () => {
        it('bloqueia Gerente de conceder canApprovePurchases', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'x@x.com',
                        name: 'X',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                        storeIds: ['store-A'],
                        canApprovePurchases: true,
                    } as any,
                    gerenteDaLojaA(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });

        it('permite Proprietário conceder canApprovePurchases', async () => {
            prisma.user.findUnique.mockResolvedValue(null);
            prisma.user.create.mockResolvedValue({ id: 'u-6' });

            await expect(
                service.create(
                    {
                        email: 'x@x.com',
                        name: 'X',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                        canApprovePurchases: true,
                    } as any,
                    proprietario(),
                ),
            ).resolves.toMatchObject({ id: 'u-6' });
        });

        it('bloqueia Administrativo de alterar moduleAccess/canViewPayrollBills', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.create(
                    {
                        email: 'x@x.com',
                        name: 'X',
                        password: 'senha123',
                        role: UserRole.FUNCIONARIO,
                        canViewPayrollBills: false,
                    } as any,
                    administrativo(),
                ),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    describe('findAll — isolamento de conta demo', () => {
        it('esconde contas demo de usuário real', async () => {
            prisma.user.findMany.mockResolvedValue([]);

            await service.findAll(proprietario());

            const call = prisma.user.findMany.mock.calls[0][0];
            expect(call.where.isDemo).toBe(false);
        });

        it('conta demo enxerga só o próprio universo demo (sem forçar isDemo:false)', async () => {
            prisma.user.findMany.mockResolvedValue([]);

            await service.findAll({ ...proprietario(), isDemo: true });

            const call = prisma.user.findMany.mock.calls[0][0];
            expect(call.where.isDemo).toBeUndefined();
        });
    });

    describe('removeDefinitivo — exclusão física restrita', () => {
        it('bloqueia excluir a própria conta', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'user-1',
                isAdminMaster: false,
            });

            await expect(
                service.removeDefinitivo('user-1', proprietario()),
            ).rejects.toThrow(ConflictException);

            expect(prisma.user.delete).not.toHaveBeenCalled();
        });

        it('bloqueia excluir outra conta de Admin Master', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'user-9',
                isAdminMaster: true,
            });

            await expect(
                service.removeDefinitivo('user-9', proprietario()),
            ).rejects.toThrow(ConflictException);

            expect(prisma.user.delete).not.toHaveBeenCalled();
        });

        it('converte erro de FK (P2003) em mensagem amigável', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'user-9',
                isAdminMaster: false,
            });
            prisma.userStore.deleteMany.mockResolvedValue({});
            prisma.user.delete.mockRejectedValue({ code: 'P2003' });

            await expect(
                service.removeDefinitivo('user-9', proprietario()),
            ).rejects.toThrow(ConflictException);
        });

        it('exclui normalmente quando não há restrição', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'user-9',
                isAdminMaster: false,
            });
            prisma.userStore.deleteMany.mockResolvedValue({});
            prisma.user.delete.mockResolvedValue({});

            const result = await service.removeDefinitivo('user-9', proprietario());

            expect(result).toEqual({ ok: true });
        });
    });

    describe('findOne — acesso por loja em quem não tem acesso global', () => {
        it('bloqueia Gerente de ver usuário de loja que não é dele', async () => {
            prisma.user.findUnique.mockResolvedValue({
                id: 'target',
                role: UserRole.FUNCIONARIO,
                userStores: [{ storeId: 'store-B' }],
            });

            await expect(
                service.findOne('target', gerenteDaLojaA()),
            ).rejects.toThrow(ForbiddenException);
        });

        it('lança NotFoundException se o usuário não existe', async () => {
            prisma.user.findUnique.mockResolvedValue(null);

            await expect(
                service.findOne('inexistente', proprietario()),
            ).rejects.toThrow(NotFoundException);
        });
    });
});
