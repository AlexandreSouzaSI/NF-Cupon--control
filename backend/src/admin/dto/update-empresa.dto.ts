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

    // Empresa isenta de planos/cobrança (ex.: Nugalho) — nunca vê "Planos"
    // nem é bloqueada. Só o Admin Master edita (rota /admin).
    @IsOptional()
    @IsBoolean()
    planExempt?: boolean;
}
