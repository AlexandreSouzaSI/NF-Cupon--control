import {
    ArrayMinSize,
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CreateDevolucaoItemDto } from './create-devolucao-item.dto';

export class CreateDevolucaoNfeDto {
    @IsString()
    storeId!: string;

    // NF de entrada (IncomingGoodsNf) que está sendo devolvida — precisa
    // ter o XML completo já disponível (após manifestação), senão não dá
    // pra saber os itens/CFOPs originais.
    @IsString()
    incomingGoodsNfId!: string;

    // Motivo da devolução (produto errado, vencido, avariado etc.) — vai
    // pro infCpl do XML.
    @IsString()
    motivo!: string;

    // Série mostrada (editável) na tela de Devolução, já vindo
    // preenchida com store.devolucaoNfeSerie — se não vier, cai no valor
    // salvo na loja (ver devolucoes.service.ts).
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    serie?: number;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CreateDevolucaoItemDto)
    itens!: CreateDevolucaoItemDto[];
}
