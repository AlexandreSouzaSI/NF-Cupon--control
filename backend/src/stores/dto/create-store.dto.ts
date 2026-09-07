import { IsOptional, IsString } from 'class-validator';

export class CreateStoreDto {
    @IsString()
    name!: string;

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

    // Endereço estruturado + Inscrição Estadual — só usados pra emitir
    // NF-e própria (bloco <emit>/<enderEmit> exige campos separados, não
    // endereço livre). Opcionais no cadastro comum da loja.
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