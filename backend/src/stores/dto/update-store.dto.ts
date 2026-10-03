import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoPessoaStore } from '@prisma/client';

export class UpdateStoreDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEnum(TipoPessoaStore)
    tipoPessoa?: TipoPessoaStore;

    @IsOptional()
    @IsString()
    cpf?: string;

    @IsOptional()
    @IsString()
    telefoneAvisoDiario?: string;

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