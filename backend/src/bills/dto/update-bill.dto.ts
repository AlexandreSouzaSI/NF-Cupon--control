import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

import {
    BillPaymentMethod,
    BillStatus,
    ExternalLaunchStatus,
    PayableType,
    PixKeyType,
} from '@prisma/client';

export class UpdateBillDto {
    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    value?: number;

    @IsOptional()
    @IsEnum(PayableType)
    type?: PayableType;

    @IsOptional()
    @IsEnum(BillPaymentMethod)
    paymentMethod?: BillPaymentMethod;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsDateString()
    paidAt?: string;

    @IsOptional()
    @IsEnum(BillStatus)
    status?: BillStatus;

    @IsOptional()
    @IsString()
    storeId?: string;

    @IsOptional()
    @IsString()
    purchaseId?: string;

    @IsOptional()
    @IsString()
    supplierId?: string;

    @IsOptional()
    @IsEnum(ExternalLaunchStatus)
    externalLaunchStatus?: ExternalLaunchStatus;

    @IsOptional()
    @IsString()
    externalSystemName?: string;

    @IsOptional()
    @IsString()
    externalCode?: string;

    @IsOptional()
    @IsBoolean()
    hasBillFile?: boolean;

    @IsOptional()
    @IsString()
    barcode?: string;

    @IsOptional()
    @IsString()
    pixKey?: string;

    @IsOptional()
    @IsEnum(PixKeyType)
    pixKeyType?: PixKeyType;

    @IsOptional()
    @IsString()
    pixQrCode?: string;

    @IsOptional()
    @IsString()
    bankName?: string;

    @IsOptional()
    @IsString()
    bankAgency?: string;

    @IsOptional()
    @IsString()
    bankAccount?: string;

    @IsOptional()
    @IsString()
    beneficiary?: string;

    @IsOptional()
    @IsString()
    fileUrl?: string;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsString()
    paymentProofUrl?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}