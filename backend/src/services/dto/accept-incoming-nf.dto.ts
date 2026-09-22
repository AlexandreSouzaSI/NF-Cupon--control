import {
    IsBoolean,
    IsDateString,
    IsEnum,
    IsIn,
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

    // Escolha explícita de Boleto/PIX/Nenhum feita na hora — tem prioridade
    // sobre a inferência por conteúdo de pixKey/barcode em
    // derivePaymentDefaults (ver bill-payment-defaults.util.ts). Sem isso,
    // escolher "Boleto" sem ainda ter o código virava "sem boleto" por
    // engano.
    @IsOptional()
    @IsIn(['PIX', 'BOLETO', 'NONE'])
    paymentType?: 'PIX' | 'BOLETO' | 'NONE';
}
