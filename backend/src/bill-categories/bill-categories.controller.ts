import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FindOrCreateBillCategoryDto } from './dto/find-or-create-bill-category.dto';
import { BillCategoriesService } from './bill-categories.service';

@Controller('bill-categories')
@UseGuards(JwtAuthGuard)
export class BillCategoriesController {
    constructor(private billCategoriesService: BillCategoriesService) { }

    @Post('find-or-create')
    async findOrCreate(@Body() body: FindOrCreateBillCategoryDto) {
        return this.billCategoriesService.findOrCreate(body.name);
    }

    @Get()
    async findAll(@Query('search') search?: string) {
        return this.billCategoriesService.findAll(search);
    }

    @Get('suggest')
    async suggest(@Query('supplierId') supplierId?: string) {
        if (!supplierId) return null;
        return this.billCategoriesService.suggestForSupplier(supplierId);
    }
}
