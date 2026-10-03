import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { TipoPessoaStore } from '@prisma/client';

export class CreateStoreDto {
    @IsString()
    name!: string;

    // Loja "pessoal" do proprietário (contas da casa, não do negócio) —
    // continua na mesma empresa, só nasce com o menu restrito a Dashboard +
    // Contas a Pagar (ver stores.service.ts create()). Default: JURIDICA.
    @IsOptional()
    @IsEnum(TipoPessoaStore)
    tipoPessoa?: TipoPessoaStore;

    @IsOptional()
    @IsString()
    cpf?: string;

    // Telefone (só dígitos + DDI 55) que recebe aviso diário via WhatsApp
    // das contas com vencimento hoje — normalizado no service.
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