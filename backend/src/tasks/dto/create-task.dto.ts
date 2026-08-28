import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TaskRecurrence } from '@prisma/client';

// FormData (multipart, usado na criação) manda tudo como string — sem
// isso, "false" viraria truthy pro class-transformer.
function toBoolean({ value }: { value: unknown }) {
    return value === true || value === 'true';
}

export class CreateTaskDto {
    @IsString()
    title!: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsString()
    storeId!: string;

    @IsString()
    assignedToId!: string;

    @IsEnum(TaskRecurrence)
    recurrence!: TaskRecurrence;

    // Obrigatório quando recurrence = WEEKLY (0=domingo ... 6=sábado).
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(6)
    weekday?: number;

    // Obrigatório quando recurrence = MONTHLY.
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(31)
    dayOfMonth?: number;

    // Obrigatório quando recurrence = ONCE ("AAAA-MM-DD").
    @IsOptional()
    @IsString()
    dueDate?: string;

    // Só tem efeito se quem estiver criando/editando for Proprietário —
    // o service ignora silenciosamente se vier de outro perfil.
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    restrictedFromAdministrativo?: boolean;

    // Só tem efeito se quem estiver criando/editando for Proprietário ou
    // Administrativo.
    @IsOptional()
    @Transform(toBoolean)
    @IsBoolean()
    restrictedFromGerente?: boolean;
}
