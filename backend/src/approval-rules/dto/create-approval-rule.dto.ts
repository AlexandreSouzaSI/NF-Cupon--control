import { Type } from 'class-transformer';
import {
    IsEnum,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

import { ApprovalLevel } from '@prisma/client';

export class CreateApprovalRuleDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minValue!: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    maxValue?: number;

    @IsEnum(ApprovalLevel)
    level!: ApprovalLevel;

    @IsOptional()
    @IsString()
    storeId?: string;
}