import {
    IsArray,
    IsBoolean,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

import { StoreModule, UserRole } from '@prisma/client';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEmail()
    email?: string;

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    storeIds?: string[];

    @IsOptional()
    active?: boolean;

    // Permissão extra pra aprovar/reprovar compras — só quem já aprova por
    // conta própria (Admin Master ou Proprietário) pode enviar esse campo,
    // ver ensureCanGrantApprovalPermission em users.service.ts.
    @IsOptional()
    @IsBoolean()
    canApprovePurchases?: boolean;

    // Recebe WhatsApp quando um fornecedor confirma um pedido de cotação
    // (Cadastros → Colaboradores). Exige `phone` preenchido pra funcionar
    // de verdade, mas pode ser marcado antes.
    @IsOptional()
    @IsBoolean()
    notifyQuotationConfirmed?: boolean;

    // Lista de módulos liberados pra essa pessoa especificamente — só o
    // Proprietário (ou Admin Master) pode enviar esse campo, ver
    // ensureCanGrantModuleAccess em users.service.ts. Vazio = sem
    // restrição extra (usa só perfil + loja, como hoje).
    @IsOptional()
    @IsArray()
    @IsEnum(StoreModule, { each: true })
    moduleAccess?: StoreModule[];

    // Permissão de ver valor de conta categoria Funcionários/Freelancer
    // em Contas a Pagar — mesma restrição de quem pode enviar esse campo.
    @IsOptional()
    @IsBoolean()
    canViewPayrollBills?: boolean;
}