import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseVoiceService } from './purchase-voice.service';

describe('PurchasesController', () => {
    let controller: PurchasesController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PurchasesController],
            providers: [
                { provide: PurchasesService, useValue: {} },
                { provide: PurchaseVoiceService, useValue: {} },
                // ModuleAccessGuard (@UseGuards no controller) injeta
                // PrismaService — sem esse mock o Nest não consegue montar
                // o guard e o módulo de teste falha ao compilar.
                { provide: PrismaService, useValue: {} },
            ],
        }).compile();

        controller = module.get<PurchasesController>(PurchasesController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
