import {
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLossDto {
    @IsString()
    storeId!: string;

    @IsString()
    description!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0.001)
    quantity!: number;

    @IsOptional()
    @IsString()
    unit?: string;

    @IsOptional()
    @IsString()
    reason?: string;

    // Valor unitário — opcional, só é usado se essa perda entrar numa NF-e
    // de baixa de estoque mais tarde.
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    unitValue?: number;

    // NCM do produto (8 dígitos) — opcional. Sem isso, a NF de perda usa
    // um NCM genérico de alimentos/bebidas só pra não travar o XML; se
    // você souber o NCM certo do produto, informe aqui pra sair correto.
    @IsOptional()
    @IsString()
    ncm?: string;

    // ISO datetime — se não vier, usa o momento do registro (padrão:
    // registro é feito na hora que a perda aconteceu).
    @IsOptional()
    @IsString()
    occurredAt?: string;
}
