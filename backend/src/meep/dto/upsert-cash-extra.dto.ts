import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Lançamento manual complementar da Conciliação de Caixa da Meep — por
// loja + dia comercial ("AAAA-MM-DD", mesmo formato usado em todo o
// bridge Meep, ver business-day.util.ts). Freelancer/Descontos/Outros/
// Vale não vêm de nenhuma API, então o próprio usuário digita.
export class UpsertCashExtraDto {
    @IsString()
    storeId!: string;

    @IsString()
    businessDay!: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    freelancer?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    descontos?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    outros?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    vale?: number;

    @IsOptional()
    @IsString()
    observacao?: string;

    // Linha "editável" — vem preenchida com o valor calculado da Meep,
    // mas o usuário pode corrigir; o que vier aqui é o que fica salvo
    // como valor "oficial" do sistema pra esse dia.
    @IsOptional()
    @IsNumber()
    @Min(0)
    sistemaCredito?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    sistemaDebito?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    sistemaPix?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    sistemaDinheiro?: number;

    // Linha "Banco" — o que de fato caiu na conta, digitado manualmente.
    @IsOptional()
    @IsNumber()
    @Min(0)
    bancoCredito?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    bancoDebito?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    bancoPix?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    bancoDinheiro?: number;
}
