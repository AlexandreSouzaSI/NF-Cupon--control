import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { EstoqueService } from './estoque.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { LinkNfItemsDto } from './dto/link-nf-items.dto';
import { LinkPurchaseItemsDto } from './dto/link-purchase-items.dto';

// Quem lida com o estoque físico do dia a dia — mesmo espírito de
// acesso do módulo Compras, com ESTOQUISTA (perfil já existente,
// pensado exatamente pra isso) incluído.
@Controller('estoque')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.ESTOQUE)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
)
export class EstoqueController {
    constructor(private estoqueService: EstoqueService) { }

    // --- Catálogo ---

    @Get('itens')
    async listItems(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('categoria') categoria?: string,
        @Query('search') search?: string,
        @Query('onlyNegative') onlyNegative?: string,
    ) {
        return this.estoqueService.listItems(user, {
            storeId,
            categoria,
            search,
            onlyNegative: onlyNegative === 'true',
        });
    }

    @Get('categorias')
    async listCategorias(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.estoqueService.listCategorias(user, storeId);
    }

    // Itens abaixo do estoque mínimo — base da Lista de Compra do
    // Estoque. Precisa vir antes de "itens/:id" no roteamento, mas como
    // o prefixo aqui é diferente ("lista-compra") não tem colisão.
    @Get('lista-compra')
    async listaCompra(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.estoqueService.listaCompra(user, storeId);
    }

    @Post('itens')
    async createItem(@Body() body: CreateStockItemDto, @CurrentUser() user: any) {
        return this.estoqueService.createItem(body, user);
    }

    @Patch('itens/:id')
    async updateItem(
        @Param('id') id: string,
        @Body() body: UpdateStockItemDto,
        @CurrentUser() user: any,
    ) {
        return this.estoqueService.updateItem(id, body, user);
    }

    // --- Movimentações ---

    @Get('movimentacoes')
    async listMovements(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('stockItemId') stockItemId?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.estoqueService.listMovements(user, {
            storeId,
            stockItemId,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
        });
    }

    @Post('movimentacoes')
    async registrarMovimento(@Body() body: CreateStockMovementDto, @CurrentUser() user: any) {
        return this.estoqueService.registrarMovimentoManual(body, user);
    }

    // --- Vínculo de NF aceita ---

    @Get('nf-pendentes')
    async listNfsPendentes(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.estoqueService.listNfsPendentes(user, storeId);
    }

    @Get('nf/:id/itens')
    async getNfItens(@Param('id') id: string, @CurrentUser() user: any) {
        return this.estoqueService.getNfItensParaVinculo(id, user);
    }

    @Post('nf/:id/vincular')
    async vincularNf(
        @Param('id') id: string,
        @Body() body: LinkNfItemsDto,
        @CurrentUser() user: any,
    ) {
        return this.estoqueService.vincularNfAoEstoque(id, body, user);
    }

    // --- Vínculo de compra sem NF (Fluxo 2) ---

    @Get('compras-pendentes')
    async listComprasPendentes(@CurrentUser() user: any, @Query('storeId') storeId: string) {
        return this.estoqueService.listComprasPendentes(user, storeId);
    }

    @Get('compra/:id/itens')
    async getCompraItens(@Param('id') id: string, @CurrentUser() user: any) {
        return this.estoqueService.getCompraItensParaVinculo(id, user);
    }

    @Post('compra/:id/vincular')
    async vincularCompra(
        @Param('id') id: string,
        @Body() body: LinkPurchaseItemsDto,
        @CurrentUser() user: any,
    ) {
        return this.estoqueService.vincularCompraAoEstoque(id, body, user);
    }

    // --- Importação por planilha ---

    // Planilha modelo — cabeçalho Nome/Categoria/Quantidade/Valor, só
    // Nome obrigatório. Precisa vir antes de nenhuma rota ":id" conflitar
    // (não tem risco aqui, mas mantendo o padrão dos outros módulos).
    @Get('modelo')
    async gerarModelo(@Res() res: Response) {
        const buffer = await this.estoqueService.gerarModeloPlanilha();

        res.set({
            'Content-Type':
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="estoque-modelo.xlsx"',
        });

        res.send(buffer);
    }

    @Post('importar')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            limits: { fileSize: 15 * 1024 * 1024 },
            fileFilter: (_req, file, callback) => {
                const nomeOk = file.originalname.toLowerCase().endsWith('.xlsx');

                if (!nomeOk) {
                    return callback(new Error('Envie um arquivo .xlsx.'), false);
                }

                callback(null, true);
            },
        }),
    )
    async importarPlanilha(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
    ) {
        return this.estoqueService.importarPlanilha(storeId, file, user);
    }
}
