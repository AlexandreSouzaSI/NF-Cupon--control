import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
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

import { ProductSalesService } from './product-sales.service';

// Análise de vendas por produto (importação da planilha do PDV) — quem
// decide compra (Comprador/Gerente) e gestão acompanham; mesmo espírito de
// acesso do Tributos, mas com Gerente incluído porque o objetivo principal
// aqui é ajustar quantidade de compra à realidade de venda, algo que o
// Gerente da loja acompanha no dia a dia.
@Controller('product-sales')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.PRODUTOS)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.FINANCEIRO,
)
export class ProductSalesController {
    constructor(private productSalesService: ProductSalesService) { }

    @Post('import')
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
    async importExcel(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
        @Body('periodoInicio') periodoInicio?: string,
        @Body('periodoFim') periodoFim?: string,
    ) {
        return this.productSalesService.importExcel(storeId, file, user, {
            inicio: periodoInicio,
            fim: periodoFim,
        });
    }

    // Importação em massa de fichas técnicas a partir de uma planilha
    // .xlsx (coluna A = prato, colunas seguintes = "Ingrediente -
    // Gramatura" por célula, dados a partir da linha 2). Sempre
    // substitui a ficha técnica que já existir pra cada prato.
    @Post('import-recipes-excel')
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
    async importarFichasTecnicasExcel(
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
    ) {
        return this.productSalesService.importarFichasTecnicasExcel(
            storeId,
            file,
            user,
        );
    }

    // Visão geral pra aba Ficha Técnica: todo prato conhecido da loja com
    // os ingredientes/itens de produção já cadastrados nele — usada pra
    // montar a lista editável em tela (sem abrir modal por prato).
    @Get('recipes-overview')
    async getFichaTecnicaOverview(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.productSalesService.getFichaTecnicaOverview(storeId, user);
    }

    // Planilha modelo pra importação de fichas técnicas, com a coluna A
    // já preenchida com o nome de cada produto que já tem venda
    // importada nesta loja — garante que o nome bate certinho com o que
    // o sistema espera. Precisa vir antes de "imports" pra não colidir
    // com nenhuma rota parecida.
    @Get('recipe-template')
    async gerarModeloFichasTecnicas(
        @CurrentUser() user: any,
        @Res() res: Response,
        @Query('storeId') storeId: string,
    ) {
        const buffer = await this.productSalesService.gerarModeloFichasTecnicas(
            storeId,
            user,
        );

        res.set({
            'Content-Type':
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition':
                'attachment; filename="fichas-tecnicas-modelo.xlsx"',
        });

        res.send(buffer);
    }

    // Apaga TODAS as fichas técnicas da loja (pra recomeçar do zero antes
    // de importar uma planilha nova). Tira backup antes — dá pra
    // desfazer com POST /product-sales/recipes-undo.
    @Delete('recipes')
    async limparFichasTecnicas(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.productSalesService.limparFichasTecnicas(storeId, user);
    }

    // Diz se tem uma importação recente de fichas técnicas pra desfazer.
    @Get('recipes-undo-status')
    async statusBackupFichasTecnicas(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.productSalesService.statusBackupFichasTecnicas(storeId, user);
    }

    // Desfaz a última importação em massa de fichas técnicas.
    @Post('recipes-undo')
    async desfazerImportacaoFichasTecnicas(
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
    ) {
        return this.productSalesService.desfazerImportacaoFichasTecnicas(
            storeId,
            user,
        );
    }

    // Lista de compra sugerida: média de KG de cada ingrediente comida
    // (sem bebida) nos períodos já importados que seguem o mesmo padrão
    // de dias do período pedido — pra saber quanto abastecer pro próximo
    // período igual. tipo = TERCA_QUINTA | SEXTA_SEGUNDA | SEMANA.
    @Get('lista-compra-sugerida')
    async listaCompraSugerida(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('tipo') tipo: 'TERCA_QUINTA' | 'SEXTA_SEGUNDA' | 'SEMANA',
    ) {
        return this.productSalesService.listaCompraSugerida(user, {
            storeId,
            tipo,
        });
    }

    @Get('imports')
    async findImports(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.productSalesService.findImports(user, {
            storeId,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
        });
    }

    @Delete('imports/:id')
    async removeImport(@Param('id') id: string, @CurrentUser() user: any) {
        return this.productSalesService.removeImport(id, user);
    }

    // Corrige período/nome do local de uma importação já feita (não
    // reprocessa a planilha).
    @Put('imports/:id')
    async updateImport(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Body('periodoInicio') periodoInicio?: string,
        @Body('periodoFim') periodoFim?: string,
        @Body('nomeLocal') nomeLocal?: string,
    ) {
        return this.productSalesService.updateImport(id, user, {
            periodoInicio,
            periodoFim,
            nomeLocal,
        });
    }

    @Get('summary')
    async productSummary(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('importId') importId?: string,
        @Query('categoria') categoria?: string,
        @Query('periodoInicio') periodoInicio?: string,
        @Query('periodoFim') periodoFim?: string,
    ) {
        return this.productSalesService.productSummary(user, {
            storeId,
            importId,
            categoria,
            periodoInicio,
            periodoFim,
        });
    }

    // Ficha técnica (ingredientes + gramas) de um prato específico.
    @Get('recipe')
    async getRecipe(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('produto') produto: string,
    ) {
        return this.productSalesService.getRecipe(user, { storeId, produto });
    }

    // Salva a ficha técnica inteira de um prato (substitui a lista
    // anterior). Body: { storeId, produto, itens: [{ stockItemId, gramas }] }
    @Put('recipe')
    async saveRecipe(
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
        @Body('produto') produto: string,
        @Body('itens')
        itens: { stockItemId?: string; productionItemId?: string; gramas: number }[],
    ) {
        return this.productSalesService.saveRecipe(user, {
            storeId,
            produto,
            itens: Array.isArray(itens) ? itens : [],
        });
    }

    // Catálogo de itens de estoque da loja — pra seletor na hora de
    // montar a ficha técnica de um prato (vínculo direto, sem digitar
    // nome), e pra tela de configuração da Lista de Compra.
    @Get('ingredients')
    async listStockItemsCatalog(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.productSalesService.listStockItemsCatalog(user, storeId);
    }

    // Configura como um item de estoque é contado na Lista de Compra de
    // Produtos: KG/LITRO (peso/volume) ou UNIDADE (contagem — Pastel,
    // Coxinha, Costelinha Suína...), e opcionalmente o peso de uma
    // peça/pacote inteiro (Picanha peça, Batata Frita pacote de 400g)
    // pra sugerir também "quantas peças/pacotes" comprar, além do KG.
    @Put('ingredients/:id')
    async atualizarConfigStockItem(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Body('unidadeMedida') unidadeMedida?: 'KG' | 'LITRO' | 'UNIDADE',
        @Body('pesoUnidadeGramas') pesoUnidadeGramas?: number | null,
        @Body('isProteina') isProteina?: boolean,
        @Body('porcaoPadraoGramas') porcaoPadraoGramas?: number | null,
        @Body('categoriaLista') categoriaLista?: string | null,
        @Body('ordemLista') ordemLista?: number | null,
    ) {
        return this.productSalesService.atualizarConfigStockItem(user, id, {
            unidadeMedida,
            pesoUnidadeGramas,
            isProteina,
            porcaoPadraoGramas,
            categoriaLista,
            ordemLista,
        });
    }

    // Cria/ajusta de uma vez os ingredientes-padrão da lista fornecida
    // pelo chefe de produção (Proteínas e Cortes / Feijoada / Noite de
    // petiscos), marcando categoria e ordem certas — ver comentário no
    // service (LISTA_PADRAO_PROTEINAS).
    @Post('ingredients/import-lista-padrao')
    async importarListaPadrao(
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
    ) {
        return this.productSalesService.importarListaPadrao(user, storeId);
    }

    // Consumo total por ingrediente (KG), somando todos os pratos
    // vendidos que usam cada um — ver comentário no service.
    @Get('ingredients-summary')
    async ingredientsSummary(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('importId') importId?: string,
        @Query('categoria') categoria?: string,
        @Query('periodoInicio') periodoInicio?: string,
        @Query('periodoFim') periodoFim?: string,
    ) {
        return this.productSalesService.ingredientsSummary(user, {
            storeId,
            importId,
            categoria,
            periodoInicio,
            periodoFim,
        });
    }
}
