import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BillsController } from './bills.controller';
import { BillsNfService } from './bills-nf.service';
import { BillsService } from './bills.service';

@Module({
    controllers: [BillsController],
    providers: [BillsService, BillsNfService, PrismaService],
    exports: [BillsService, BillsNfService],
})
export class BillsModule { }