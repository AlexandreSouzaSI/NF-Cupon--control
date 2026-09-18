import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Lançamento manual, item por item — cobre tanto uma entrada avulsa
// (comprou algo sem passar por NF) quanto um ajuste/baixa manual
// (quebra não registrada em Perdas, contagem física divergente etc).
export class CreateStockMovementDto {
    @IsString()
    storeId!: string;

    @IsString()
    stockItemId!: string;

    @IsIn(['ENTRADA', 'SAIDA'])
    tipo!: 'ENTRADA' | 'SAIDA';

    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    quantidade!: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    valorTotal?: number;

    @IsOptional()
    @IsString()
    observacao?: string;

    // ISO datetime — se não vier, usa o momento do lançamento.
    @IsOptional()
    @IsString()
    data?: string;
}
