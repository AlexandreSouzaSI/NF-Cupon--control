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

    // ISO datetime — se não vier, usa o momento do registro (padrão:
    // registro é feito na hora que a perda aconteceu).
    @IsOptional()
    @IsString()
    occurredAt?: string;
}
