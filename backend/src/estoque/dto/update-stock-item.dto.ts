import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStockItemDto {
    @IsOptional()
    @IsString()
    nome?: string;

    @IsOptional()
    @IsString()
    descricao?: string;

    @IsOptional()
    @IsString()
    categoria?: string;

    @IsOptional()
    @IsIn(['KG', 'LITRO', 'UNIDADE'])
    unidadeMedida?: 'KG' | 'LITRO' | 'UNIDADE';

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

    // Estoque máximo — nível alvo pra sugestão de compra. Passar 0 zera
    // (sugestão volta a mirar só o mínimo).
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estoqueMaximo?: number;
}
