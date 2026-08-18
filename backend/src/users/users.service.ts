import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// Perfis que um Gerente nunca pode criar/editar/desativar — evita que um
// Gerente crie outro Gerente (ou se promova a Administrativo/Proprietário)
// pela tela de Usuários. Administrativo/Proprietário continuam sem essa
// restrição (acesso global).
const ELEVATED_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
];

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    private hasGlobalStoreAccess(user: any) {
        return (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        );
    }

    private getAllowedStoreIds(user: any): string[] {
        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    // Gerente só cria/edita usuários de perfil não-elevado, e só se pelo
    // menos uma das lojas envolvidas (do usuário alvo, ou informada no
    // cadastro) for uma loja à qual o próprio Gerente tem acesso. Cada
    // checagem (role/lojas) só roda se a chave correspondente foi
    // explicitamente passada — permite chamar só pra revalidar o role, por
    // exemplo, sem reexigir targetStoreIds nessa chamada específica.
    private ensureManagedUserAccess(
        actingUser: any,
        options: { targetRole?: UserRole; targetStoreIds?: string[] },
    ) {
        if (this.hasGlobalStoreAccess(actingUser)) return;

        if (options.targetRole && ELEVATED_ROLES.includes(options.targetRole)) {
            throw new ForbiddenException(
                'Você não pode gerenciar um usuário com esse perfil.',
            );
        }

        if (options.targetStoreIds) {
            const allowedStoreIds = this.getAllowedStoreIds(actingUser);

            const hasOverlap = options.targetStoreIds.some((id) =>
                allowedStoreIds.includes(id),
            );

            if (!hasOverlap) {
                throw new ForbiddenException(
                    'Você só pode gerenciar usuários vinculados às suas lojas.',
                );
            }
        }
    }

    async create(dto: CreateUserDto, actingUser?: any) {
        const userExists = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (userExists) {
            throw new ConflictException('E-mail já cadastrado');
        }

        if (actingUser) {
            this.ensureManagedUserAccess(actingUser, {
                targetRole: dto.role,
                targetStoreIds: dto.storeIds || [],
            });
        }

        const password = await bcrypt.hash(dto.password, 10);

        return this.prisma.user.create({
            data: {
                name: dto.name,
                email: dto.email,
                password,
                role: dto.role,
                active: true,
                userStores: {
                    create:
                        dto.storeIds?.map((storeId) => ({
                            storeId,
                        })) || [],
                },
            },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }

    async findAll(actingUser?: any) {
        const allowedStoreIds = actingUser && !this.hasGlobalStoreAccess(actingUser)
            ? this.getAllowedStoreIds(actingUser)
            : undefined;

        return this.prisma.user.findMany({
            where: allowedStoreIds
                ? { userStores: { some: { storeId: { in: allowedStoreIds } } } }
                : undefined,
            orderBy: {
                name: 'asc',
            },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }

    // Versão com escopo, usada pela rota GET /users/:id — a versão sem
    // escopo (findById) continua existindo pro JwtStrategy popular o
    // próprio usuário autenticado e pro update/remove reaproveitarem.
    async findOne(id: string, actingUser: any) {
        const user = await this.findById(id);

        if (!this.hasGlobalStoreAccess(actingUser)) {
            this.ensureManagedUserAccess(actingUser, {
                targetRole: user.role,
                targetStoreIds: user.userStores.map((us: any) => us.storeId),
            });
        }

        return user;
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }

    async findById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        return user;
    }

    async update(id: string, dto: UpdateUserDto, actingUser?: any) {
        const existing = await this.findById(id);

        if (actingUser && !this.hasGlobalStoreAccess(actingUser)) {
            this.ensureManagedUserAccess(actingUser, {
                targetRole: existing.role,
                targetStoreIds: existing.userStores.map((us: any) => us.storeId),
            });

            if (dto.role) {
                this.ensureManagedUserAccess(actingUser, { targetRole: dto.role });
            }

            if (dto.storeIds) {
                this.ensureManagedUserAccess(actingUser, {
                    targetStoreIds: dto.storeIds,
                });
            }
        }

        if (dto.email) {
            const emailExists = await this.prisma.user.findFirst({
                where: {
                    email: dto.email,
                    id: {
                        not: id,
                    },
                },
            });

            if (emailExists) {
                throw new ConflictException('E-mail já está em uso');
            }
        }

        let hashedPassword: string | undefined;

        if (dto.password) {
            hashedPassword = await bcrypt.hash(dto.password, 10);
        }

        return this.prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id },
                data: {
                    name: dto.name,
                    email: dto.email,
                    password: hashedPassword,
                    role: dto.role,
                    active: dto.active,
                },
            });

            if (dto.storeIds) {
                await tx.userStore.deleteMany({
                    where: {
                        userId: id,
                    },
                });

                if (dto.storeIds.length > 0) {
                    await tx.userStore.createMany({
                        data: dto.storeIds.map((storeId) => ({
                            userId: id,
                            storeId,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            return tx.user.findUnique({
                where: { id: user.id },
                include: {
                    userStores: {
                        include: {
                            store: true,
                        },
                    },
                },
            });
        });
    }

    async remove(id: string, actingUser?: any) {
        const existing = await this.findById(id);

        if (actingUser && !this.hasGlobalStoreAccess(actingUser)) {
            this.ensureManagedUserAccess(actingUser, {
                targetRole: existing.role,
                targetStoreIds: existing.userStores.map((us: any) => us.storeId),
            });
        }

        return this.prisma.user.update({
            where: { id },
            data: {
                active: false,
            },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }
}