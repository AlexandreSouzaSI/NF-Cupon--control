import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminMasterGuard } from '../auth/admin-master.guard';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { FindOrCreateSupplierDto } from './dto/find-or-create-supplier.dto';
import { CreateSupplierCategoryDto } from './dto/create-supplier-category.dto';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard)
export class SuppliersController {
    constructor(private suppliersService: SuppliersService) { }

    // Precisa vir antes de rotas tipo ":id" implícitas — aqui não tem
    // conflito real (paths fixos), mas mantém o padrão do resto do
    // projeto de declarar o path fixo primeiro.
    @Get('categories')
    async findAllCategories() {
        return this.suppliersService.findAllCategories();
    }

    @Post('categories')
    async createCategory(@Body() body: CreateSupplierCategoryDto) {
        return this.suppliersService.createCategory(body);
    }

    @Patch('categories/:id')
    async renameCategory(
        @Param('id') id: string,
        @Body('name') name: string,
    ) {
        return this.suppliersService.renameCategory(id, name);
    }

    // Excluir categoria de verdade — restrito ao dono do sistema
    // (isAdminMaster), igual todo o resto dos "excluir definitivo" desta
    // leva. Antes disso qualquer autenticado conseguia apagar categoria.
    @Delete('categories/:id')
    @UseGuards(AdminMasterGuard)
    async removeCategory(@Param('id') id: string) {
        return this.suppliersService.removeCategory(id);
    }

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

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateSupplierDto,
    ) {
        return this.suppliersService.update(id, body);
    }

    // Exclusão de verdade — restrita ao dono do sistema (isAdminMaster).
    // O resto do time (Administrativo/Proprietário) segue só podendo
    // editar (PUT acima) ou desativar via campo "active".
    @Delete(':id')
    @UseGuards(AdminMasterGuard)
    async remove(@Param('id') id: string) {
        return this.suppliersService.remove(id);
    }
}
