import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFreelancerDto {
    @IsString()
    name!: string;

    @IsString()
    storeId!: string;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    defaultDailyValue!: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}
