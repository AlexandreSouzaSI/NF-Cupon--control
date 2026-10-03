import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateEmpresaDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsOptional()
    @IsString()
    cnpj?: string;

    @IsOptional()
    @IsString()
    adminNotes?: string;
}
