import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCardDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsOptional()
    @IsString()
    lastDigits?: string;

    @IsOptional()
    @IsString()
    holderName?: string;

    @IsString()
    @IsNotEmpty()
    storeId!: string;
}