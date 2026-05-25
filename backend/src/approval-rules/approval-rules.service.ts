import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

@Injectable()
export class ApprovalRulesService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateApprovalRuleDto) {
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

    async findAll() {
        return this.prisma.approvalRule.findMany({
            where: {
                active: true,
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