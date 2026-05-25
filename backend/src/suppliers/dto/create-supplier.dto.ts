import { IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    cnpj?: string;

    @IsOptional()
    @IsString()
    phone?: string;
}