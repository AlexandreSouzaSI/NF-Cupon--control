import { Type } from 'class-transformer';
import {
    IsArray,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

// Um componente da receita (StockItem + quantidade, na unidade do
// próprio StockItem) consumido a cada "baseQuantidade" produzida.
export class ProductionRecipeComponentDto {
    @IsString()
    stockItemId!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    quantidade!: number;
}

export class CreateProductionItemDto {
    @IsString()
    storeId!: string;

    @IsString()
    nome!: string;

    @IsOptional()
    @IsIn(['KG', 'ML', 'UNIDADE'])
    unidadeMedida?: 'KG' | 'ML' | 'UNIDADE';

    // Tamanho do "lote" em que a receita abaixo é expressa — ex: 100
    // (a receita é "por 100ml") ou 1 (a receita é "por 1 porção").
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    baseQuantidade?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ProductionRecipeComponentDto)
    receita?: ProductionRecipeComponentDto[];
}
