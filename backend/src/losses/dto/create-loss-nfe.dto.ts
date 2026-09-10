import { ArrayMinSize, IsArray, IsOptional, IsString } from 'class-validator';

export class CreateLossNfeDto {
    @IsString()
    storeId!: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    lossIds!: string[];

    // Motivo da baixa (perecimento, quebra, roubo/furto etc.) — vira o
    // texto de infAdFisco na NF-e, exigido pelo Ajuste SINIEF 49/2025. Se
    // for roubo/furto, inclua o número do B.O. aqui.
    @IsString()
    justificativa!: string;

    // CFOP a ser usado nos itens da NF. Depende de orientação do contador
    // (varia por caso/regime) — por isso é opcional e preenchido na hora,
    // em vez de fixo no código. Se não vier, usa o padrão sugerido (5927).
    @IsOptional()
    @IsString()
    cfop?: string;
}
