import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaxRegimeType } from '@prisma/client';

export class CreateTaxRegimeConfigDto {
    @IsString()
    storeId!: string;

    @IsEnum(TaxRegimeType)
    regime!: TaxRegimeType;

    @IsDateString()
    effectiveFrom!: string;

    @IsOptional()
    @IsString()
    simplesAnexo?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    presumidoIrpjPercent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    presumidoCsllPercent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    presumidoPisCofinsPercent?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    realPisCofinsPercent?: number;

    @IsOptional()
    @IsBoolean()
    icmsRegimeEspecialMg?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    icmsAliquotaRefeicao?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    icmsAliquotaOutras?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    icmsAliquotaPadrao?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}
