import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsDateString,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class WorkDayEntryDto {
    @IsDateString()
    date!: string;

    // Se não informado, usa o valor padrão do cadastro do freelancer na
    // hora de montar o quadro de pagamentos.
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    value?: number;
}

export class SetWorkDaysDto {
    // Terça-feira da semana sendo editada (mesma âncora usada em todo o
    // resto da tela: Terça a Domingo).
    @IsString()
    weekStart!: string;

    // Só os dias marcados — os que não vierem aqui são removidos dessa
    // semana pra esse freelancer.
    @IsArray()
    @ArrayMaxSize(6)
    @ValidateNested({ each: true })
    @Type(() => WorkDayEntryDto)
    days!: WorkDayEntryDto[];
}
