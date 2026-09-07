import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { BillCategoriesController } from './bill-categories.controller';
import { BillCategoriesService } from './bill-categories.service';

@Module({
    controllers: [BillCategoriesController],
    providers: [BillCategoriesService, PrismaService],
    exports: [BillCategoriesService],
})
export class BillCategoriesModule { }
