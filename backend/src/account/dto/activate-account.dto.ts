import { IsString, MinLength } from 'class-validator';

export class ActivateAccountDto {
    @IsString()
    @MinLength(6)
    password!: string;
}
