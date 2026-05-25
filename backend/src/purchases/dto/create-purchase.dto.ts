import { Type } from 'class-transformer';
import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

import { PaymentMethod } from '@prisma/client';

export class CreatePurchaseDto {
    @IsString()
    @IsNotEmpty()
    description!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    value!: number;

    @IsEnum(PaymentMethod)
    method!: PaymentMethod;

    @IsString()
    @IsNotEmpty()
    storeId!: string;

    @IsOptional()
    @IsString()
    supplierId?: string;

    @IsOptional()
    @IsString()
    cardId?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}