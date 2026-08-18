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
    ExternalLaunchStatus,
    PayableType,
    PixKeyType,
} from '@prisma/client';

export class CreateBillDto {
    @IsString()
    description!: string;

    @IsNumber()
    @Min(0)
    value!: number;

    @IsEnum(PayableType)
    type!: PayableType;

    @IsEnum(BillPaymentMethod)
    paymentMethod!: BillPaymentMethod;

    @IsDateString()
    dueDate!: string;

    @IsString()
    storeId!: string;

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