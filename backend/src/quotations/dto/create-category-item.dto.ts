import { IngredientUnidade } from '@prisma/client';
import {
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';

// Adiciona um item na lista curada de uma categoria — ou vinculado a um
// StockItem do Estoque (storeId+stockItemId), ou avulso (descricaoManual
// + unidadeMedidaManual + quantidadeSugeridaOverride, sem stockItemId).
export class CreateCategoryItemDto {
    @IsString()
    categoryId!: string;

    @IsString()
    storeId!: string;

    @IsOptional()
    @IsString()
    stockItemId?: string;

    @IsOptional()
    @IsString()
    descricaoManual?: string;

    @IsOptional()
    @IsEnum(IngredientUnidade)
    unidadeMedidaManual?: IngredientUnidade;

    @IsOptional()
    @IsNumber()
    quantidadeSugeridaOverride?: number;

    @IsOptional()
    @IsInt()
    ordem?: number;
}
