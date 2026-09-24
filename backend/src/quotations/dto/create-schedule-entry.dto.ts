import { IsInt, IsString, Max, Min } from 'class-validator';

// diaSemana segue Date.getDay(): 0 = domingo ... 6 = sábado (mesmo
// padrão documentado no schema, QuotationScheduleEntry.diaSemana).
export class CreateScheduleEntryDto {
    @IsString()
    storeId!: string;

    @IsInt()
    @Min(0)
    @Max(6)
    diaSemana!: number;

    @IsString()
    categoryId!: string;
}
