import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';

@Module({
    controllers: [BillsController],
    providers: [BillsService, PrismaService],
    exports: [BillsService],
})
export class BillsModule { }