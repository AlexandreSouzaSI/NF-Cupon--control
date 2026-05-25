import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalRulesController } from './approval-rules.controller';

describe('ApprovalRulesController', () => {
  let controller: ApprovalRulesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApprovalRulesController],
    }).compile();

    controller = module.get<ApprovalRulesController>(ApprovalRulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
