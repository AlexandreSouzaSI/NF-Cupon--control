import { IsOptional, IsString } from 'class-validator';

export class ConfirmOccurrenceDto {
    @IsOptional()
    @IsString()
    notes?: string;
}
