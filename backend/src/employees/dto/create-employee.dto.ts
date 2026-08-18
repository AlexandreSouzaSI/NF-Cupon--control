import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PayoutMethod, PixKeyType } from '@prisma/client';

export class CreateEmployeeDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    cpf?: string;

    @IsOptional()
    @IsString()
    role?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsDateString()
    admissionDate?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsString()
    storeId!: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    salary?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    advanceValue?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(31)
    advanceDay?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    paymentValue?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(31)
    paymentDay?: number;

    // Valor de uma passagem — o total pago no dia é o dobro (ida e volta).
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    vtValue?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    bonusValue?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(31)
    bonusDay?: number;

    @IsOptional()
    @IsEnum(PayoutMethod)
    paymentMethod?: PayoutMethod;

    @IsOptional()
    @IsString()
    pixKey?: string;

    @IsOptional()
    @IsEnum(PixKeyType)
    pixKeyType?: PixKeyType;
}
