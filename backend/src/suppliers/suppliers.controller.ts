import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { FindOrCreateSupplierDto } from './dto/find-or-create-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
    constructor(private suppliersService: SuppliersService) { }

    @Post()
    async create(@Body() body: CreateSupplierDto) {
        return this.suppliersService.create(body);
    }

    @Post('find-or-create')
    async findOrCreate(@Body() body: FindOrCreateSupplierDto) {
        return this.suppliersService.findOrCreate(body.name);
    }

    @Get()
    async findAll(@Query('search') search?: string) {
        return this.suppliersService.findAll(search);
    }
}
