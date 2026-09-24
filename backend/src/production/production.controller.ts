import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { ProductionService } from './production.service';
import { CreateProductionItemDto } from './dto/create-production-item.dto';
import { UpdateProductionItemDto } from './dto/update-production-item.dto';
import { ProduzirDto } from './dto/produzir.dto';

// Aba Produção — pré-preparo/porcionamento a partir do Estoque (ver
// comentário do model ProductionItem no schema). Mesmo módulo (Produtos)
// e mesmo espírito de acesso do product-sales/estoque: quem decide compra
// e a gestão do dia a dia da cozinha/bar.
@Controller('production')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.PRODUTOS)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
)
export class ProductionController {
    constructor(private productionService: ProductionService) {}

    @Get('items')
    async listItems(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.productionService.listItems(user, storeId);
    }

    @Get('items/:id')
    async getItem(@Param('id') id: string, @CurrentUser() user: any) {
        return this.productionService.getItem(id, user);
    }

    @Post('items')
    async createItem(@Body() body: CreateProductionItemDto, @CurrentUser() user: any) {
        return this.productionService.createItem(body, user);
    }

    @Patch('items/:id')
    async updateItem(
        @Param('id') id: string,
        @Body() body: UpdateProductionItemDto,
        @CurrentUser() user: any,
    ) {
        return this.productionService.updateItem(id, body, user);
    }

    @Delete('items/:id')
    async removeItem(@Param('id') id: string, @CurrentUser() user: any) {
        return this.productionService.removeItem(id, user);
    }

    // "Hoje eu porcionei/produzi X" — abate proporcional do Estoque +
    // credita o estoque de Produção deste item.
    @Post('items/:id/produzir')
    async produzir(
        @Param('id') id: string,
        @Body() body: ProduzirDto,
        @CurrentUser() user: any,
    ) {
        return this.productionService.produzir(id, body, user);
    }

    @Get('movimentacoes')
    async listMovements(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('productionItemId') productionItemId?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.productionService.listMovements(user, {
            storeId,
            productionItemId,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
        });
    }
}
