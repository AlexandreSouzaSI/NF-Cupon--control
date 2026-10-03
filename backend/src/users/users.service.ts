import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { normalizePhone } from '../common/phone.util';
import {
    ACCOUNT_ACTIVATION_INVITE_EVENT,
    ACCOUNT_ACTIVATION_INVITE_EMAIL_EVENT,
} from '../common/events';

// 7 dias — dá tempo da pessoa ver a mensagem no WhatsApp com calma antes
// do link expirar (ver docs/BUSINESS_RULES.md).
const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Quem pode cadastrar/editar um usuário de cada perfil-alvo. Admin Master
// (flag isAdminMaster, só o dono do sistema) sempre pode, além de quem
// estiver listado aqui. Perfis não listados (legado: Comprador/Estoquista/
// Financeiro, fora de foco no momento) caem no fallback abaixo, que mantém
// o comportamento de antes (Proprietário/Administrativo/Gerente podem).
const ROLE_ASSIGNERS: Partial<Record<UserRole, UserRole[]>> = {
    // Só o próprio Proprietário (ou Admin Master) cria/edita outro Proprietário.
    [UserRole.PROPRIETARIO]: [UserRole.PROPRIETARIO],
    // Proprietário ou Administrativo cria/edita Administrativo ou Gerente.
    [UserRole.ADMINISTRATIVO]: [UserRole.PROPRIETARIO, UserRole.ADMINISTRATIVO],
    [UserRole.GERENTE]: [UserRole.PROPRIETARIO, UserRole.ADMINISTRATIVO],
    [UserRole.FUNCIONARIO]: [
        UserRole.PROPRIETARIO,
        UserRole.ADMINISTRATIVO,
        UserRole.GERENTE,
    ],
};

// Perfis legados (módulo de Compras fora de foco) — mantém a regra antiga:
// Proprietário, Administrativo e Gerente podem gerenciar.
const DEFAULT_ROLE_ASSIGNERS: UserRole[] = [
    UserRole.PROPRIETARIO,
    UserRole.ADMINISTRATIVO,
    UserRole.GERENTE,
];

@Injectable()
export class UsersService {
    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
    ) { }

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

    // Mesma ideia do check em update()/create(), reaproveitada em
    // findOne/remove: Admin Master escapa, todo o resto só mexe em gente da
    // própria empresa.
    private ensureSameEmpresa(actingUser: any, targetEmpresaId: string | null) {
        if (actingUser.isAdminMaster) return;

        if (targetEmpresaId !== actingUser.empresaId) {
            throw new ForbiddenException(
                'Você só pode gerenciar usuários da sua empresa.',
            );
        }
    }

    // Multi-tenant: valida que as lojas informadas pertencem à MESMA empresa
    // do usuário que está agindo — sem isso, "acesso global" (Administrativo/
    // Proprietário, ver hasGlobalStoreAccess acima) significaria acesso
    // global a QUALQUER loja do banco, inclusive de outra empresa-cliente.
    // Admin Master (isAdminMaster) sempre escapa dessa checagem, porque ele
    // de propósito opera entre empresas (painel /admin).
    private async ensureStoresBelongToActingEmpresa(
        actingUser: any,
        storeIds: string[],
    ) {
        if (actingUser.isAdminMaster) return;
        if (!storeIds || storeIds.length === 0) return;

        const stores = await this.prisma.store.findMany({
            where: { id: { in: storeIds } },
            select: { id: true, empresaId: true },
        });

        const foreign = stores.some(
            (store) => store.empresaId !== actingUser.empresaId,
        );

        if (foreign || stores.length !== storeIds.length) {
            throw new ForbiddenException(
                'Você só pode gerenciar usuários vinculados a lojas da sua empresa.',
            );
        }
    }

    // Admin Master (dono do sistema) sempre pode gerenciar qualquer
    // perfil — é uma flag à parte do role, não um role em si.
    private canAssignRole(actingUser: any, targetRole: UserRole): boolean {
        if (actingUser.isAdminMaster) return true;

        const allowed = ROLE_ASSIGNERS[targetRole] ?? DEFAULT_ROLE_ASSIGNERS;

        return allowed.includes(actingUser.role);
    }

    // Dono do sistema sempre pode; qualquer outra pessoa (mesmo
    // Proprietário) só se tiver a flag canManagePermissions marcada nela
    // mesma — ver comentário do campo em schema.prisma. Essa é a checagem
    // base reaproveitada pelas três guards de permissão abaixo.
    private hasPermissionsManagementPower(actingUser: any): boolean {
        if (actingUser.isAdminMaster) return true;

        return actingUser.canManagePermissions === true;
    }

    // Só quem tem o poder de mexer em permissões (ver
    // hasPermissionsManagementPower acima) pode conceder ou tirar a
    // permissão extra canApprovePurchases de outro usuário — evita que,
    // por exemplo, um Proprietário sem essa flag libere aprovação pra
    // alguém.
    private ensureCanGrantApprovalPermission(actingUser: any) {
        if (this.hasPermissionsManagementPower(actingUser)) return;

        throw new ForbiddenException(
            'Você não tem permissão pra mexer em permissões de colaborador. Peça pro Admin Master liberar isso pra você.',
        );
    }

    // Mesma ideia da checagem acima, só que pra moduleAccess (quais
    // módulos essa pessoa pode acessar) e canViewPayrollBills (ver valor
    // de conta Funcionários/Freelancer).
    private ensureCanGrantModuleAccess(actingUser: any) {
        if (this.hasPermissionsManagementPower(actingUser)) return;

        throw new ForbiddenException(
            'Você não tem permissão pra mexer em permissões de colaborador. Peça pro Admin Master liberar isso pra você.',
        );
    }

    // A própria flag canManagePermissions só pode ser concedida/tirada
    // pelo Admin Master — diferente das duas guards acima, aqui NÃO basta
    // já ter a flag (senão qualquer um que ganhasse o poder uma vez
    // poderia replicá-lo pra qualquer outra pessoa, inclusive pra si
    // mesmo de novo depois de perder). Só o dono do sistema decide quem
    // entra e quem sai desse grupo restrito.
    private ensureCanGrantPermissionsManagement(actingUser: any) {
        if (actingUser.isAdminMaster) return;

        throw new ForbiddenException(
            'Só o Admin Master pode liberar ou tirar de alguém o poder de mexer em permissões.',
        );
    }

    // Duas checagens independentes:
    // 1) Perfil-alvo — quem pode cadastrar/editar/desativar alguém com
    //    aquele perfil (matriz ROLE_ASSIGNERS, roda pra todo mundo,
    //    inclusive Proprietário/Administrativo, já que agora há perfis que
    //    nem esses dois podem atribuir livremente).
    // 2) Loja — só entra pra quem não tem acesso global (Gerente etc):
    //    precisa ter pelo menos uma loja em comum com o usuário alvo.
    // Cada checagem só roda se a chave correspondente foi explicitamente
    // passada — permite chamar só pra revalidar o role, por exemplo, sem
    // reexigir targetStoreIds nessa chamada específica.
    private ensureManagedUserAccess(
        actingUser: any,
        options: { targetRole?: UserRole; targetStoreIds?: string[] },
    ) {
        if (options.targetRole && !this.canAssignRole(actingUser, options.targetRole)) {
            throw new ForbiddenException(
                'Você não pode cadastrar ou editar um usuário com esse perfil.',
            );
        }

        // Admin Master (painel /admin) não tem role nem userStores próprios
        // — ele age em nome da empresa-cliente escolhida, não da própria.
        // A checagem de "loja pertence à mesma empresa" já roda à parte em
        // ensureStoresBelongToActingEmpresa; aqui só escapamos do check de
        // overlap de loja, que não faz sentido pra ele.
        if (actingUser.isAdminMaster) return;

        if (this.hasGlobalStoreAccess(actingUser)) return;

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

        // Multi-tenant: a quem esse usuário novo pertence. Quem cria age
        // dentro da própria empresa sempre (mesmo tendo "acesso global" de
        // Proprietário/Administrativo — isso é global DENTRO da empresa, não
        // entre empresas). Só o Admin Master, criando pelo painel /admin,
        // pode passar dto.empresaId explicitamente pra escolher em qual
        // empresa nova o usuário nasce.
        const empresaId = actingUser?.isAdminMaster
            ? dto.empresaId ?? null
            : actingUser?.empresaId ?? null;

        if (actingUser) {
            this.ensureManagedUserAccess(actingUser, {
                targetRole: dto.role,
                targetStoreIds: dto.storeIds || [],
            });

            await this.ensureStoresBelongToActingEmpresa(
                actingUser.isAdminMaster
                    ? { isAdminMaster: false, empresaId }
                    : actingUser,
                dto.storeIds || [],
            );

            if (dto.canApprovePurchases !== undefined) {
                this.ensureCanGrantApprovalPermission(actingUser);
            }

            if (
                dto.moduleAccess !== undefined ||
                dto.canViewPayrollBills !== undefined
            ) {
                this.ensureCanGrantModuleAccess(actingUser);
            }

            if (dto.canManagePermissions !== undefined) {
                this.ensureCanGrantPermissionsManagement(actingUser);
            }
        }

        const phone = dto.phone?.trim() ? normalizePhone(dto.phone) : null;

        if (phone) {
            const phoneExists = await this.prisma.user.findUnique({
                where: { phone },
            });

            if (phoneExists) {
                throw new ConflictException(
                    'Esse telefone já está cadastrado em outro usuário.',
                );
            }
        }

        // Sem senha informada = fluxo de convite: a pessoa recebe um link
        // único por WhatsApp e cria a própria senha (ver módulo account/).
        // Precisa de telefone pra isso — sem telefone não tem como mandar
        // o convite, então exigimos os dois juntos.
        const isInviteFlow = !dto.password;

        if (isInviteFlow && !phone) {
            throw new BadRequestException(
                'Informe o telefone (com DDD) pra mandar o convite de ativação por WhatsApp, ou informe uma senha pra já criar a conta ativa.',
            );
        }

        let password: string;
        let activationToken: string | null = null;
        let activationTokenExpiresAt: Date | null = null;

        if (isInviteFlow) {
            // Placeholder inutilizável — ninguém consegue logar com essa
            // "senha" (não é exposta em lugar nenhum), só existe porque a
            // coluna é obrigatória. accountActivated=false já bloqueia o
            // login de qualquer forma (ver AuthService.login).
            password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
            activationToken = randomBytes(24).toString('hex');
            activationTokenExpiresAt = new Date(
                Date.now() + ACTIVATION_TOKEN_TTL_MS,
            );
        } else {
            password = await bcrypt.hash(dto.password as string, 10);
        }

        const user = await this.prisma.user.create({
            data: {
                name: dto.name,
                email: dto.email,
                password,
                role: dto.role,
                phone,
                empresaId,
                active: true,
                accountActivated: !isInviteFlow,
                activationToken,
                activationTokenExpiresAt,
                canApprovePurchases: dto.canApprovePurchases ?? false,
                notifyQuotationConfirmed: dto.notifyQuotationConfirmed ?? false,
                moduleAccess: dto.moduleAccess ?? [],
                canViewPayrollBills: dto.canViewPayrollBills ?? true,
                canManagePermissions: dto.canManagePermissions ?? false,
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

        if (isInviteFlow && activationToken) {
            const frontendUrl = (process.env.FRONTEND_URL || '').replace(
                /\/$/,
                '',
            );
            const link = `${frontendUrl}/ativar-conta/${activationToken}`;

            // Manda pelos dois canais sempre que possível — WhatsApp
            // depende de provedor configurado (Evolution API) e, mesmo
            // configurado, pode falhar; e-mail é obrigatório pra todo
            // usuário, então serve de garantia de que o convite chega em
            // algum lugar. Cada canal decide/loga sua própria falha, sem
            // travar a criação do usuário.
            if (phone) {
                this.eventEmitter.emit(ACCOUNT_ACTIVATION_INVITE_EVENT, {
                    userId: user.id,
                    name: user.name,
                    phone,
                    link,
                });
            }

            this.eventEmitter.emit(ACCOUNT_ACTIVATION_INVITE_EMAIL_EVENT, {
                userId: user.id,
                name: user.name,
                email: user.email,
                link,
            });
        }

        return user;
    }

    async findAll(actingUser?: any) {
        const allowedStoreIds = actingUser && !this.hasGlobalStoreAccess(actingUser)
            ? this.getAllowedStoreIds(actingUser)
            : undefined;

        const where: any = {};

        if (allowedStoreIds) {
            where.userStores = { some: { storeId: { in: allowedStoreIds } } };
        }

        // Multi-tenant: "acesso global" (Administrativo/Proprietário) só
        // enxerga todo mundo DENTRO da própria empresa — sem isso, o
        // Proprietário da empresa A veria os funcionários da empresa B
        // nessa mesma tela. Admin Master, com uma loja ativa selecionada no
        // topo, vê só os colaboradores da empresa dessa loja
        // (activeStoreEmpresaId, ver jwt.strategy.ts); sem loja ativa (ex.:
        // painel /admin) continua vendo todo mundo, de propósito.
        if (actingUser && !actingUser.isAdminMaster) {
            where.empresaId = actingUser.empresaId;
        } else if (actingUser?.isAdminMaster && actingUser.activeStoreEmpresaId) {
            where.empresaId = actingUser.activeStoreEmpresaId;
        }

        // Conta de teste (isDemo) nunca aparece pra ninguém do time de
        // verdade, nem pro Proprietário com acesso global — some da lista
        // de Cadastros → Usuários igual sumiria se fosse uma base
        // separada, sem precisar duplicar tabela nenhuma. Uma conta de
        // teste olhando essa mesma tela continua vendo só ela mesma (o
        // filtro por loja acima já cuida disso).
        if (!actingUser?.isDemo) {
            where.isDemo = false;
        }

        return this.prisma.user.findMany({
            where,
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

        this.ensureSameEmpresa(actingUser, user.empresaId);

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

    async findByPhone(phone: string) {
        return this.prisma.user.findUnique({
            where: { phone: normalizePhone(phone) },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }

    // Login unificado: identifier pode ser telefone (com ou sem
    // formatação — normalizado antes de comparar) ou e-mail (contas
    // antigas que ainda não têm telefone cadastrado). Um "@" no meio do
    // texto é o suficiente pra diferenciar, já que telefone nunca tem "@".
    async findByIdentifier(identifier: string) {
        const trimmed = identifier.trim();

        if (trimmed.includes('@')) {
            return this.findByEmail(trimmed);
        }

        return this.findByPhone(trimmed);
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

        if (actingUser) {
            // Multi-tenant: mesmo com acesso global (Administrativo/
            // Proprietário), só edita gente da própria empresa. Admin
            // Master escapa (gerencia qualquer empresa pelo /admin).
            if (!actingUser.isAdminMaster && existing.empresaId !== actingUser.empresaId) {
                throw new ForbiddenException(
                    'Você só pode gerenciar usuários da sua empresa.',
                );
            }

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

                await this.ensureStoresBelongToActingEmpresa(
                    actingUser,
                    dto.storeIds,
                );
            }

            if (dto.canApprovePurchases !== undefined) {
                this.ensureCanGrantApprovalPermission(actingUser);
            }

            // Mesma checagem que já existe no create() — faltava aqui
            // (achado numa investigação: update() gravava moduleAccess/
            // canViewPayrollBills sem checar quem podia mandar esses
            // campos). Só o Proprietário/Admin Master edita.
            if (
                dto.moduleAccess !== undefined ||
                dto.canViewPayrollBills !== undefined
            ) {
                this.ensureCanGrantModuleAccess(actingUser);
            }

            if (dto.canManagePermissions !== undefined) {
                this.ensureCanGrantPermissionsManagement(actingUser);
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

        let normalizedPhone: string | null | undefined;

        if (dto.phone !== undefined) {
            normalizedPhone = dto.phone?.trim() ? normalizePhone(dto.phone) : null;

            if (normalizedPhone) {
                const phoneExists = await this.prisma.user.findFirst({
                    where: { phone: normalizedPhone, id: { not: id } },
                });

                if (phoneExists) {
                    throw new ConflictException(
                        'Esse telefone já está cadastrado em outro usuário.',
                    );
                }
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
                    phone: normalizedPhone,
                    active: dto.active,
                    canApprovePurchases: dto.canApprovePurchases,
                    notifyQuotationConfirmed: dto.notifyQuotationConfirmed,
                    moduleAccess: dto.moduleAccess,
                    canViewPayrollBills: dto.canViewPayrollBills,
                    canManagePermissions: dto.canManagePermissions,
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

        if (actingUser) {
            this.ensureSameEmpresa(actingUser, existing.empresaId);

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

    // Exclusão de verdade — restrita ao dono do sistema (AdminMasterGuard
    // no controller). Nunca apaga a própria conta nem outra conta
    // isAdminMaster, pra não travar o acesso ao sistema.
    async removeDefinitivo(id: string, actingUser: any) {
        const existing = await this.findById(id);

        if (existing.id === actingUser?.id) {
            throw new ConflictException(
                'Você não pode excluir a própria conta.',
            );
        }

        if (existing.isAdminMaster) {
            throw new ConflictException(
                'Não é possível excluir outra conta de Admin Master.',
            );
        }

        try {
            await this.prisma.userStore.deleteMany({ where: { userId: id } });
            await this.prisma.user.delete({ where: { id } });
        } catch (error: any) {
            if (error?.code === 'P2003') {
                throw new ConflictException(
                    'Esse usuário tem registros vinculados (compras, tarefas, etc.) que impedem a exclusão definitiva.',
                );
            }
            throw error;
        }

        return { ok: true };
    }
}