import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { ApprovalRulesService } from './approval-rules.service';

import { CreateApprovalRuleDto } from './dto/create-approval-rule.dto';

@Controller('approval-rules')
@UseGuards(JwtAuthGuard)
export class ApprovalRulesController {
    constructor(private approvalRulesService: ApprovalRulesService) { }

    @Post()
    async create(@Body() body: CreateApprovalRuleDto, @CurrentUser() user: any) {
        return this.approvalRulesService.create(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.approvalRulesService.findAll(user);
    }
}