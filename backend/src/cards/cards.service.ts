import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCardDto } from './dto/create-card.dto';

@Injectable()
export class CardsService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateCardDto) {
        return this.prisma.card.create({
            data: {
                name: dto.name,
                lastDigits: dto.lastDigits,
                holderName: dto.holderName,
                storeId: dto.storeId,
            },
            include: {
                store: true,
            },
        });
    }

    async findAll() {
        return this.prisma.card.findMany({
            where: {
                active: true,
            },
            include: {
                store: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

    async remove(id: string) {
        const card = await this.prisma.card.findUnique({
            where: { id },
        });

        if (!card) {
            throw new NotFoundException('Cartão não encontrado');
        }

        return this.prisma.card.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }
}