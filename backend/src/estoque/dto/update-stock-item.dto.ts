import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStockItemDto {
    @IsOptional()
    @IsString()
    nome?: string;

    @IsOptional()
    @IsString()
    categoria?: string;

    @IsOptional()
    @IsIn(['KG', 'UNIDADE'])
    unidadeMedida?: 'KG' | 'UNIDADE';

    // Passar string vazia solta o vínculo (fica sem Ingredient).
    @IsOptional()
    @IsString()
    ingredientId?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    // Estoque mínimo — abaixo disso entra na Lista de Compra do Estoque.
    // Passar 0 zera o mínimo (item some da lista de compra sugerida).
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estoqueMinimo?: number;
}
