import { Module } from '@nestjs/common';

import { ApprovalRulesController } from './approval-rules.controller';

import { ApprovalRulesService } from './approval-rules.service';

@Module({
  controllers: [ApprovalRulesController],
  providers: [ApprovalRulesService],
})
export class ApprovalRulesModule { }