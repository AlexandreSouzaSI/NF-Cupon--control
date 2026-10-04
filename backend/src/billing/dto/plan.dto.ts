import { StoreModule } from '@prisma/client';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

import { ALL_STORE_MODULES } from '../../common/store-module-labels';

export class CreatePlanDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsOptional()
    @IsString()
    description?: string;

    // Em centavos (R$ 199,90 = 19990). Mínimo de R$ 5,00: valor mínimo de
    // cobrança aceito pelo Asaas.
    @IsInt()
    @Min(500, { message: 'O preço mínimo de um plano é R$ 5,00.' })
    priceCents!: number;

    @IsArray()
    @ArrayMinSize(1, { message: 'Escolha ao menos um módulo para o plano.' })
    @IsIn(ALL_STORE_MODULES, { each: true })
    modules!: StoreModule[];

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsInt()
    sortOrder?: number;
}

export class UpdatePlanDto {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsInt()
    @Min(500, { message: 'O preço mínimo de um plano é R$ 5,00.' })
    priceCents?: number;

    @IsOptional()
    @IsArray()
    @ArrayMinSize(1, { message: 'Escolha ao menos um módulo para o plano.' })
    @IsIn(ALL_STORE_MODULES, { each: true })
    modules?: StoreModule[];

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsInt()
    sortOrder?: number;
}
