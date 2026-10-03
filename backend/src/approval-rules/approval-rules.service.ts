import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';
import {
    resolveAllowedStoreIds,
    ensureStoreAccessScoped,
} from '../common/store-scope.util';

@Injectable()
export class ApprovalRulesService {
    constructor(private prisma: PrismaService) { }

    private hasGlobalAccess(user: any) {
        return (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        );
    }

    // Delega pro helper compartilhado (src/common/store-scope.util.ts) — corrige vazamento cross-empresa: antes, ADMINISTRATIVO/PROPRIETARIO de qualquer empresa via/mexia em dado de qualquer outra (undefined = sem filtro nenhum, escrito quando só existia uma empresa no banco).
    private async getAllowedStoreIds(user: any): Promise<string[] | undefined> {
        return resolveAllowedStoreIds(this.prisma, user);
    }

    async create(dto: CreateApprovalRuleDto, user: any) {
        if (!dto.storeId && !this.hasGlobalAccess(user)) {
            throw new ForbiddenException(
                'Apenas Administrativo ou Proprietário podem criar uma regra válida para todas as lojas.',
            );
        }

        if (dto.storeId) {
            const allowedStoreIds = await this.getAllowedStoreIds(user);

            if (allowedStoreIds && !allowedStoreIds.includes(dto.storeId)) {
                throw new ForbiddenException(
                    'Você não tem acesso a esta loja.',
                );
            }
        }

        return this.prisma.approvalRule.create({
            data: {
                name: dto.name,
                minValue: dto.minValue,
                maxValue: dto.maxValue,
                level: dto.level,
                storeId: dto.storeId,
            },
            include: {
                store: true,
            },
        });
    }

    async findAll(user: any) {
        const allowedStoreIds = await this.getAllowedStoreIds(user);

        return this.prisma.approvalRule.findMany({
            where: {
                active: true,
                ...(allowedStoreIds
                    ? {
                        OR: [
                            { storeId: null },
                            { storeId: { in: allowedStoreIds } },
                        ],
                    }
                    : {}),
            },
            include: {
                store: true,
            },
            orderBy: {
                minValue: 'asc',
            },
        });
    }
}