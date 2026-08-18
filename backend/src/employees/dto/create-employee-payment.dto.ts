import {
    IsDateString,
    IsEnum,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeePaymentType } from '@prisma/client';

// Usado só pra lançamentos manuais/avulsos (13º, férias, rescisão, outro).
// Os lançamentos recorrentes (adiantamento, pagamento, vale-transporte,
// premiação) são gerados automaticamente a partir do cadastro do
// funcionário — ver EmployeesService.generateLaunches.
export class CreateEmployeePaymentDto {
    @IsString()
    employeeId!: string;

    @IsEnum(EmployeePaymentType)
    type!: EmployeePaymentType;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    value!: number;

    @IsDateString()
    dueDate!: string;

    @IsOptional()
    @IsString()
    referenceMonth?: string;

    @IsOptional()
    @IsString()
    notes?: string;
}
