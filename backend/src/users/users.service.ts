import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateUserDto) {
        const userExists = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });

        if (userExists) {
            throw new ConflictException('E-mail já cadastrado');
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

    async findAll() {
        return this.prisma.user.findMany({
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

    async update(id: string, dto: UpdateUserDto) {
        await this.findById(id);

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

    async remove(id: string) {
        await this.findById(id);

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