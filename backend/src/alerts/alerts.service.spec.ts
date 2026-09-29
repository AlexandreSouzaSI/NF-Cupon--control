import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
    let service: AlertsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AlertsService,
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        service = module.get<AlertsService>(AlertsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
