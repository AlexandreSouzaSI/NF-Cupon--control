import {
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

import {
    BillPaymentMethod,
    BillRecurrenceType,
    PayableType,
} from '@prisma/client';

export class CreateBillRecorrenciaDto {
    @IsString()
    description!: string;

    @IsNumber()
    @Min(0)
    value!: number;

    @IsEnum(BillRecurrenceType)
    recurrence!: BillRecurrenceType;

    // Obrigatório quando recurrence = WEEKLY. 0=domingo ... 6=sábado.
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(6)
    weekday?: number;

    // Obrigatório quando recurrence = MONTHLY. 1-30 (dias 31 não existem
    // em todo mês — cai no último dia do mês quando faltar).
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(30)
    dayOfMonth?: number;

    @IsEnum(PayableType)
    type!: PayableType;

    @IsEnum(BillPaymentMethod)
    paymentMethod!: BillPaymentMethod;

    @IsString()
    storeId!: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    supplierId?: string;
}
