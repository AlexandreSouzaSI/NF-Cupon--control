import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateStockItemDto {
    @IsString()
    storeId!: string;

    @IsString()
    nome!: string;

    // Classificação livre e mais fina que a Categoria — ex: "Proteínas -
    // Frigorífico", "Bebidas - Whisky e Gin".
    @IsOptional()
    @IsString()
    descricao?: string;

    @IsOptional()
    @IsString()
    categoria?: string;

    @IsOptional()
    @IsIn(['KG', 'LITRO', 'UNIDADE'])
    unidadeMedida?: 'KG' | 'LITRO' | 'UNIDADE';

    // Estoque mínimo — abaixo disso entra na Lista de Compra do Estoque.
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estoqueMinimo?: number;

    // Estoque máximo — nível alvo pra sugestão de compra (compra até
    // aqui, não só até o mínimo). Usado também pela Cotação.
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    estoqueMaximo?: number;
}
