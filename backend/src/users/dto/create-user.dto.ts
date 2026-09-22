import {
    IsArray,
    IsBoolean,
    IsEmail,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

import { UserRole } from '@prisma/client';

export class CreateUserDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(6)
    password!: string;

    @IsEnum(UserRole)
    role!: UserRole;

    // Só usado pra mandar aviso no WhatsApp (login continua por e-mail).
    // Aceita qualquer formato digitado — é normalizado no service antes de
    // gravar.
    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    storeIds?: string[];

    // Permissão extra pra aprovar/reprovar compras — só quem já aprova por
    // conta própria (Admin Master ou Proprietário) pode enviar esse campo,
    // ver ensureCanGrantApprovalPermission em users.service.ts.
    @IsOptional()
    @IsBoolean()
    canApprovePurchases?: boolean;
}