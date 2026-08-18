import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRevenueEntryDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    grossRevenue?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}
