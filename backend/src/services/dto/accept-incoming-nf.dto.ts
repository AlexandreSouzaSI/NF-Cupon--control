import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
} from 'class-validator';

import { PixKeyType } from '@prisma/client';

// Corpo do "Aceitar" numa NF de serviço pendente de conciliação.
// generateBill = false: só marca como aceita, sem mexer em Contas a Pagar.
// generateBill = true: cria a conta a pagar direto a partir da NF — nesse
// caso dueDate é obrigatório (o resto tem fallback: supplierName cai pro
// prestador da NF, categoryName pode ficar em branco).
export class AcceptIncomingNfDto {
    @IsBoolean()
    generateBill!: boolean;

    @IsOptional()
    @IsString()
    supplierName?: string;

    @IsOptional()
    @IsString()
    categoryName?: string;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsString()
    pixKey?: string;

    @IsOptional()
    @IsEnum(PixKeyType)
    pixKeyType?: PixKeyType;

    @IsOptional()
    @IsString()
    barcode?: string;
}
