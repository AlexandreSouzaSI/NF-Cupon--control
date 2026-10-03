import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateEmpresaDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    cnpj?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsString()
    adminNotes?: string;
}
