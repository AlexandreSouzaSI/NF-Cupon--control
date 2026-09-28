import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDto {
    // Login por telefone (com DDD, o formato principal a partir de agora)
    // OU e-mail (mantido pra não quebrar contas antigas que ainda não têm
    // telefone cadastrado). AuthService decide qual é olhando se tem "@".
    @IsString()
    @IsNotEmpty()
    identifier: string;

    @IsString()
    @MinLength(6)
    password: string;
}