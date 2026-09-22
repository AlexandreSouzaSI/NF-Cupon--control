import {
    IsArray,
    IsBoolean,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    MinLength,
} from 'class-validator';

import { UserRole } from '@prisma/client';

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
}