import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class DemoSignupDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(6)
    @IsNotEmpty()
    password!: string;
}
