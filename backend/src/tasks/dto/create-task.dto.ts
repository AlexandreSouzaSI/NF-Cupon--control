import {
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskRecurrence } from '@prisma/client';

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
}
