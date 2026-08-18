import { IsOptional, IsString } from 'class-validator';

export class UpdateStoreDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    cnpj?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    uf?: string;
}