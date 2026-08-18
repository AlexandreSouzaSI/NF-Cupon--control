import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCardDto } from './dto/create-card.dto';

@Injectable()
export class CardsService {
    constructor(private prisma: PrismaService) { }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) {
            return;
        }

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException(
                'Você não tem acesso a esta loja.',
            );
        }
    }

    async create(dto: CreateCardDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

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

    async findAll(user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        return this.prisma.card.findMany({
            where: {
                active: true,
                storeId: allowedStoreIds
                    ? {
                        in: allowedStoreIds,
                    }
                    : undefined,
            },
            include: {
                store: true,
            },
            orderBy: {
                name: 'asc',
            },
        });
    }

    async remove(id: string, user: any) {
        const card = await this.prisma.card.findUnique({
            where: { id },
        });

        if (!card) {
            throw new NotFoundException('Cartão não encontrado');
        }

        this.ensureStoreAccess(card.storeId, user);

        return this.prisma.card.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }
}