import {
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCardDto } from './dto/create-card.dto';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';

@Injectable()
export class CardsService {
    constructor(private prisma: PrismaService) { }

    // Delega pro helper compartilhado (src/common/store-scope.util.ts) — corrige vazamento cross-empresa: antes, ADMINISTRATIVO/PROPRIETARIO de qualquer empresa via/mexia em dado de qualquer outra (undefined = sem filtro nenhum, escrito quando só existia uma empresa no banco).
    private async getAllowedStoreIds(user: any): Promise<string[] | undefined> {
        return resolveAllowedStoreIds(this.prisma, user);
    }

    private async ensureStoreAccess(storeId: string, user: any) {
        return ensureStoreAccessScoped(this.prisma, storeId, user);
    }

    async create(dto: CreateCardDto, user: any) {
        await this.ensureStoreAccess(dto.storeId, user);

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
        const allowedStoreIds = await this.getAllowedStoreIds(user);

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

        await this.ensureStoreAccess(card.storeId, user);

        return this.prisma.card.update({
            where: { id },
            data: {
                active: false,
            },
        });
    }

    // Exclusão de verdade — restrita ao dono do sistema (AdminMasterGuard
    // no controller).
    async removeDefinitivo(id: string) {
        const card = await this.prisma.card.findUnique({ where: { id } });

        if (!card) {
            throw new NotFoundException('Cartão não encontrado');
        }

        try {
            await this.prisma.card.delete({ where: { id } });
        } catch (error: any) {
            if (error?.code === 'P2003') {
                throw new ConflictException(
                    'Esse cartão já tem compras vinculadas — não dá pra excluir de vez.',
                );
            }
            throw error;
        }

        return { ok: true };
    }
}