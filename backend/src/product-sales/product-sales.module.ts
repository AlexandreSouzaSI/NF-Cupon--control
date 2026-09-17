import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { ProductSalesController } from './product-sales.controller';
import { ProductSalesService } from './product-sales.service';

@Module({
    controllers: [ProductSalesController],
    providers: [ProductSalesService, PrismaService],
})
export class ProductSalesModule { }
