import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminMasterGuard } from '../auth/admin-master.guard';
import { FindOrCreateBillCategoryDto, UpdateBillCategoryDto } from './dto/find-or-create-bill-category.dto';
import { BillCategoriesService } from './bill-categories.service';

@Controller('bill-categories')
@UseGuards(JwtAuthGuard)
export class BillCategoriesController {
    constructor(private billCategoriesService: BillCategoriesService) { }

    @Post('find-or-create')
    async findOrCreate(@Body() body: FindOrCreateBillCategoryDto, @Req() req: any) {
        return this.billCategoriesService.findOrCreate(body.name, req.user, body.group);
    }

    // Cria as subcategorias padrão (Funcionários, Revenda, Matéria-prima,
    // Ativo) se ainda não existirem e devolve a lista completa.
    @Post('padrao')
    async ensureDefaults(@Req() req: any) {
        return this.billCategoriesService.ensureDefaults(req.user);
    }

    @Patch(':id')
    async update(@Param('id') id: string, @Body() body: UpdateBillCategoryDto, @Req() req: any) {
        return this.billCategoriesService.update(id, body, req.user);
    }

    @Get()
    async findAll(@Query('search') search: string | undefined, @Req() req: any) {
        return this.billCategoriesService.findAll(search, req.user);
    }

    @Get('suggest')
    async suggest(@Query('supplierId') supplierId?: string) {
        if (!supplierId) return null;
        return this.billCategoriesService.suggestForSupplier(supplierId);
    }

    // Exclusão de verdade — restrita ao dono do sistema (isAdminMaster).
    @Delete(':id')
    @UseGuards(AdminMasterGuard)
    async remove(@Param('id') id: string) {
        return this.billCategoriesService.removeDefinitivo(id);
    }
}
