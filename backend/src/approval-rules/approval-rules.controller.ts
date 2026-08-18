import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { ApprovalRulesService } from './approval-rules.service';

import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

@Controller('approval-rules')
@UseGuards(JwtAuthGuard)
export class ApprovalRulesController {
    constructor(private approvalRulesService: ApprovalRulesService) { }

    // Definir alçada de aprovação é uma decisão de gestão — só quem já
    // aprova compra (Admin/Proprietário/Gerente) mexe nisso.
    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async create(@Body() body: CreateApprovalRuleDto, @CurrentUser() user: any) {
        return this.approvalRulesService.create(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.approvalRulesService.findAll(user);
    }
}