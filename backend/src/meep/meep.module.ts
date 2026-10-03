import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeepClientService } from './meep-client.service';
import { MeepSyncService } from './meep-sync.service';
import { MeepQueryService } from './meep-query.service';
import { MeepProductSalesSyncService } from './meep-product-sales-sync.service';
import { MeepController } from './meep.controller';

// Módulo da integração Meep: cliente HTTP (token + chamadas às rotas de
// vendas), sync service com cron (respeita os limites documentados de
// cada rota) e endpoints de consulta pras telas (itens/dia, impostos,
// conciliação). A credencial em si (CRUD) fica em StoresModule, junto com
// o resto do cadastro de loja — ver stores.service.ts
// (getMeepCredentialStatus/saveMeepCredential/etc).
@Module({
    controllers: [MeepController],
    providers: [
        MeepClientService,
        MeepSyncService,
        MeepQueryService,
        MeepProductSalesSyncService,
        PrismaService,
    ],
    exports: [MeepClientService, MeepSyncService, MeepQueryService, MeepProductSalesSyncService],
})
export class MeepModule { }
