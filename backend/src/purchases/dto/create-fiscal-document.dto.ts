import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsNumber,
} from 'class-validator';

import { Type } from 'class-transformer';
import { FiscalDocumentType } from '@prisma/client';

export class CreateFiscalDocumentDto {
    @IsEnum(FiscalDocumentType)
    type!: FiscalDocumentType;

    @IsOptional()
    @IsString()
    number?: string;

    @IsOptional()
    @IsString()
    accessKey?: string;

    @IsOptional()
    @IsString()
    fileUrl?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    value?: number;

    @IsOptional()
    @IsString()
    linkedToId?: string;
}