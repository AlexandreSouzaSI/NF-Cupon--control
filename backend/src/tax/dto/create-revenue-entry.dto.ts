import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRevenueEntryDto {
    @IsString()
    @IsNotEmpty()
    storeId!: string;

    // Formato "AAAA-MM", ex: "2026-08".
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'referenceMonth deve estar no formato AAAA-MM (ex: 2026-08).',
    })
    referenceMonth!: string;

    @Type(() => Number)
    @IsNumber()
    grossRevenue!: number;

    @IsOptional()
    @IsString()
    notes?: string;
}
