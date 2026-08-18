import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

@Injectable()
export class ApprovalRulesService {
    constructor(private prisma: PrismaService) { }

    private hasGlobalAccess(user: any) {
        return (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        );
    }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (this.hasGlobalAccess(user)) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    async create(dto: CreateApprovalRuleDto, user: any) {
        if (!dto.storeId && !this.hasGlobalAccess(user)) {
            throw new ForbiddenException(
                'Apenas Administrativo ou Proprietário podem criar uma regra válida para todas as lojas.',
            );
        }

        if (dto.storeId) {
            const allowedStoreIds = this.getAllowedStoreIds(user);

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
        const allowedStoreIds = this.getAllowedStoreIds(user);

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