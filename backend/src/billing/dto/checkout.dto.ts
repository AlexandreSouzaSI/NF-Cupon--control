import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CheckoutDto {
    // Só o id do plano — o preço NUNCA vem do cliente (usa Plan.priceCents).
    @IsString()
    @IsNotEmpty()
    planId!: string;

    // CPF ou CNPJ de quem paga (Asaas exige). Se vier em branco, usa o
    // Empresa.cnpj já cadastrado; se também faltar, o backend responde
    // FISCAL_DATA_REQUIRED e a tela pede.
    @IsOptional()
    @IsString()
    cpfCnpj?: string;

    // Nome da empresa — só usado por conta de teste (que ainda não tem
    // empresa própria): vira o nome da Empresa real criada no checkout.
    @IsOptional()
    @IsString()
    empresaName?: string;
}

export class GrantSubscriptionDto {
    @IsString()
    @IsNotEmpty()
    planId!: string;

    // Dias liberados manualmente (padrão 30).
    @IsOptional()
    @IsInt()
    @Min(1)
    days?: number;
}
