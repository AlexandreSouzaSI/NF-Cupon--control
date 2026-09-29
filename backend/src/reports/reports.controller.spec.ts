import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

describe('ReportsController', () => {
    let controller: ReportsController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [ReportsController],
            providers: [
                { provide: ReportsService, useValue: {} },
                // ModuleAccessGuard (@UseGuards no controller) injeta
                // PrismaService — sem esse mock o Nest não consegue montar
                // o guard e o módulo de teste falha ao compilar.
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        controller = module.get<ReportsController>(ReportsController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
