import {
    IsArray,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

import { ReceiptStatus } from '@prisma/client';

class ReceivePurchaseItemDto {
    @IsString()
    itemId!: string;

    @IsNumber()
    receivedQuantity!: number;

    @IsOptional()
    @IsString()
    notes?: string;
}

export class ReceivePurchaseDto {
    @IsEnum(ReceiptStatus)
    status!: ReceiptStatus;

    @IsOptional()
    @IsString()
    notes?: string;

    @IsOptional()
    @IsNumber()
    finalValue?: number;

    @ValidateNested({ each: true })
    @Type(() => ReceivePurchaseItemDto)
    @IsArray()
    itemReceipts!: ReceivePurchaseItemDto[];
}