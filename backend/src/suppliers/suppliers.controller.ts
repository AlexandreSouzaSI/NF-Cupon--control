import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
    constructor(private suppliersService: SuppliersService) { }

    @Post()
    async create(@Body() body: CreateSupplierDto) {
        return this.suppliersService.create(body);
    }

    @Get()
    async findAll() {
        return this.suppliersService.findAll();
    }
}