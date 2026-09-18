import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateStockItemDto {
    @IsString()
    storeId!: string;

    @IsString()
    nome!: string;

    @IsOptional()
    @IsString()
    categoria?: string;

    @IsOptional()
    @IsIn(['KG', 'UNIDADE'])
    unidadeMedida?: 'KG' | 'UNIDADE';

    // Vínculo opcional com um Ingredient já cadastrado (Produtos →
    // Ingredientes) — só isso liga a baixa automática da venda a este
    // item. Ver comentário do model StockItem no schema.
    @IsOptional()
    @IsString()
    ingredientId?: string;

    // Estoque mínimo — abaixo disso entra na Lista de Compra do Estoque.
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estoqueMinimo?: number;
}
