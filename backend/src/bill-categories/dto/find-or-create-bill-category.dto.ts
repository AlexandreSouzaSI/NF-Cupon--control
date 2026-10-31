import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FindOrCreateBillCategoryDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    // FUNCIONARIOS | REVENDA | MATERIA_PRIMA | ATIVO (opcional)
    @IsOptional()
    @IsString()
    group?: string | null;
}

export class UpdateBillCategoryDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    group?: string | null;
}
