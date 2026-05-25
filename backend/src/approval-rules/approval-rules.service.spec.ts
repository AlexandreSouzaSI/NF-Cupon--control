import { Test, TestingModule } from '@nestjs/testing';
import { ApprovalRulesService } from './approval-rules.service';

describe('ApprovalRulesService', () => {
  let service: ApprovalRulesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprovalRulesService],
    }).compile();

    service = module.get<ApprovalRulesService>(ApprovalRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
