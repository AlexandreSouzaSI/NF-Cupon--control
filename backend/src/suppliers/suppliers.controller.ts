import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
    async findAllCategories(@Req() req: any) {
        return this.suppliersService.findAllCategories(req.user);
    }

    @Post('categories')
    async createCategory(@Body() body: CreateSupplierCategoryDto, @Req() req: any) {
        return this.suppliersService.createCategory(body, req.user);
    }

    @Patch('categories/:id')
    async renameCategory(
        @Param('id') id: string,
        @Body('name') name: string,
        @Req() req: any,
    ) {
        return this.suppliersService.renameCategory(id, name, req.user);
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
    async create(@Body() body: CreateSupplierDto, @Req() req: any) {
        return this.suppliersService.create(body, req.user);
    }

    @Post('find-or-create')
    async findOrCreate(@Body() body: FindOrCreateSupplierDto, @Req() req: any) {
        return this.suppliersService.findOrCreate(body.name, req.user);
    }

    @Get()
    async findAll(@Query('search') search: string | undefined, @Req() req: any) {
        return this.suppliersService.findAll(search, req.user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateSupplierDto,
        @Req() req: any,
    ) {
        return this.suppliersService.update(id, body, req.user);
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
