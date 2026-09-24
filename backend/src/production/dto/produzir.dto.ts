import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// "Hoje eu porcionei/produzi X" — X na unidadeMedida do próprio
// ProductionItem (ex: 10 porções de Picanha 200g, ou 500 ml de Molho da
// Casa). O service calcula o fator (X / baseQuantidade) e abate cada
// componente da receita do Estoque proporcionalmente.
export class ProduzirDto {
    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    quantidade!: number;

    @IsOptional()
    @IsString()
    observacao?: string;
}
