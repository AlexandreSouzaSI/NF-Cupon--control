import {
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { PayoutMethod, PixKeyType } from '@prisma/client';

export class UpdateServiceDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    providerName?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    value?: number;

    @IsOptional()
    @IsDateString()
    serviceDate?: string;

    @IsOptional()
    @IsString()
    storeId?: string;

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
