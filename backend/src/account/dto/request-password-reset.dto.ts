import { IsNotEmpty, IsString } from 'class-validator';

export class RequestPasswordResetDto {
    // Telefone (com DDD) ou e-mail — mesmo identificador aceito no login.
    @IsString()
    @IsNotEmpty()
    identifier!: string;
}
