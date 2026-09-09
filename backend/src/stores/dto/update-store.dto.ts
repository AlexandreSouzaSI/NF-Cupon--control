import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateStoreDto {
    @IsOptional()
    @IsString()
    name?: string;

    // Marca essa loja como a loja pública de demonstração (destino do
    // autocadastro de teste). Só deve existir uma marcada assim.
    @IsOptional()
    @IsBoolean()
    isDemo?: boolean;

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

    @IsOptional()
    @IsString()
    logradouro?: string;

    @IsOptional()
    @IsString()
    numero?: string;

    @IsOptional()
    @IsString()
    complemento?: string;

    @IsOptional()
    @IsString()
    bairro?: string;

    @IsOptional()
    @IsString()
    municipio?: string;

    @IsOptional()
    @IsString()
    codigoMunicipioIbge?: string;

    @IsOptional()
    @IsString()
    cep?: string;

    @IsOptional()
    @IsString()
    inscricaoEstadual?: string;
}