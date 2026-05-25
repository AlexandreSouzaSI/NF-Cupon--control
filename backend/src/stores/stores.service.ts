import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateStoreDto) {
        return this.prisma.store.create({
            data: {
                name: dto.name,
            },
        });
    }

    async findAll() {
        return this.prisma.store.findMany({
            where: {
                active: true,
            },
            orderBy: {
                name: 'asc',
            },
            include: {
                cards: {
                    where: {
                        active: true,
                    },
                },
            },
        });
    }

    async remove(id: string) {
        const store = await this.prisma.store.findUnique({
            where: { id },
        });

        if (!store) {
            throw new NotFoundException('Loja não encontrada');
        }

        return this.prisma.store.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }
}