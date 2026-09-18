import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateLossNfeDto {
    @IsString()
    storeId!: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    lossIds!: string[];

    // Série mostrada (editável) na tela de Gerar NF, já vindo preenchida
    // com store.lossNfeSerie — se o usuário não mudar nada, o resultado é
    // idêntico ao comportamento antigo. Se vier, sobrescreve o valor
    // salvo na loja (ver losses.service.ts).
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    serie?: number;

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

    // CST e cClassTrib do IBS/CBS (Reforma Tributária, NT 2025.002) —
    // mesma lógica do CFOP: sugestão padrão (410 / 410030) editável, já
    // que só o contador confirma o enquadramento certo. Ver aviso em
    // loss-nfe-builder.ts.
    @IsOptional()
    @IsString()
    cstIbsCbs?: string;

    @IsOptional()
    @IsString()
    cClassTrib?: string;
}
