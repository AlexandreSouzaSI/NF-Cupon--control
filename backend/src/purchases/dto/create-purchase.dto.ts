import {
    IsArray,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
    PaymentMethod,
    PurchaseCategory,
    PurchaseOrigin,
} from '@prisma/client';

class CreatePurchaseItemDto {
    @IsString()
    name!: string;

    @IsNumber()
    quantity!: number;

    @IsOptional()
    @IsString()
    unit?: string;

    @IsOptional()
    @IsNumber()
    unitPrice?: number;

    @IsOptional()
    @IsNumber()
    total?: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class CreatePurchaseDto {
    @IsString()
    description!: string;

    @IsNumber()
    value!: number;

    @IsEnum(PaymentMethod)
    method!: PaymentMethod;

    @IsString()
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

    @IsOptional()
    @IsEnum(PurchaseCategory)
    category?: PurchaseCategory;

    @IsOptional()
    @IsEnum(PurchaseOrigin)
    origin?: PurchaseOrigin;

    @IsOptional()
    @IsString()
    externalOrderCode?: string;

    @IsOptional()
    @IsString()
    invoiceResponsibleId?: string;

    @IsOptional()
    @IsDateString()
    purchasedAt?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreatePurchaseItemDto)
    items?: CreatePurchaseItemDto[];
}