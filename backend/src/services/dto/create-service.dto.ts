import {
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { PayoutMethod, PixKeyType } from '@prisma/client';

export class CreateServiceDto {
    @IsString()
    name!: string;

    @IsString()
    providerName!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsNumber()
    @Min(0)
    value!: number;

    @IsDateString()
    serviceDate!: string;

    @IsString()
    storeId!: string;

    @IsOptional()
    @IsString()
    notes?: string;

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
