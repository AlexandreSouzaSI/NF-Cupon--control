import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
    let service: DashboardService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DashboardService,
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        service = module.get<DashboardService>(DashboardService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
