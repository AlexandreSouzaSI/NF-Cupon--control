import { Test, TestingModule } from '@nestjs/testing';

import { ApprovalRulesController } from './approval-rules.controller';
import { ApprovalRulesService } from './approval-rules.service';

describe('ApprovalRulesController', () => {
    let controller: ApprovalRulesController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ApprovalRulesController],
            providers: [{ provide: ApprovalRulesService, useValue: {} }],
        }).compile();

        controller = module.get<ApprovalRulesController>(ApprovalRulesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
