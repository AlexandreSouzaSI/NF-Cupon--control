import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateUserDto) {
        const userExists = await this.prisma.user.findUnique({
            where: {
                email: dto.email,
            },
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
            where: {
                active: true,
            },
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
        return this.prisma.user.findUnique({
            where: { id },
            include: {
                userStores: {
                    include: {
                        store: true,
                    },
                },
            },
        });
    }

    async remove(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
        });

        if (!user) {
            throw new NotFoundException('Usuário não encontrado');
        }

        return this.prisma.user.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }
}