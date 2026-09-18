import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

// Um item da NF (índice dentro do array "itens" retornado pelo parse do
// XML) ligado a um item de Estoque — existente (stockItemId) ou criado
// na hora (novoNome). V1: vínculo sempre manual, item por item — ver
// comentário no StockMovement.origem NF_COMPRA.
export class LinkNfItemDto {
    @Type(() => Number)
    @IsInt()
    @Min(0)
    itemIndex!: number;

    @IsOptional()
    @IsString()
    stockItemId?: string;

    @IsOptional()
    @IsString()
    novoNome?: string;

    @IsOptional()
    @IsString()
    novaCategoria?: string;

    @IsOptional()
    @IsIn(['KG', 'UNIDADE'])
    novaUnidadeMedida?: 'KG' | 'UNIDADE';

    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    quantidade!: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    valorTotal?: number;
}

export class LinkNfItemsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => LinkNfItemDto)
    itens!: LinkNfItemDto[];
}
