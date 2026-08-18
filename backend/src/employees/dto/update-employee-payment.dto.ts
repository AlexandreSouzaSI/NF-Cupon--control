import {
    IsDateString,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// Edição de um lançamento já existente (recorrente ou manual) — permite
// ajustar valor/data antes de marcar como pago, já que os valores
// recorrentes podem variar em algum mês específico.
export class UpdateEmployeePaymentDto {
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    value?: number;

    @IsOptional()
    @IsDateString()
    dueDate?: string;

    @IsOptional()
    @IsString()
    referenceMonth?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
