import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

// Fluxo 2 (compra sem NF e nem vai ter): não existe XML pra parsear, então
// o usuário digita cada item manualmente — ligado a um item de Estoque
// existente (stockItemId) ou criado na hora (novoNome). Sem itemIndex
// porque não há uma lista de origem pra indexar; a posição no array
// enviado (índice 0, 1, 2...) é usada só internamente pra montar o
// sourceRef (reenviar a lista reedita os mesmos lançamentos em vez de
// duplicar — mesma lógica idempotente do vínculo de NF).
export class LinkPurchaseItemDto {
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
    @IsIn(['KG', 'LITRO', 'UNIDADE'])
    novaUnidadeMedida?: 'KG' | 'LITRO' | 'UNIDADE';

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

export class LinkPurchaseItemsDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => LinkPurchaseItemDto)
    itens!: LinkPurchaseItemDto[];
}
