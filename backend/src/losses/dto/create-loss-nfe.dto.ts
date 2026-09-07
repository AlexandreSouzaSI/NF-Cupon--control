import { ArrayMinSize, IsArray, IsString } from 'class-validator';

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
}
