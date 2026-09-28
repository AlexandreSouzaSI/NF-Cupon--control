import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum PasswordResetChannel {
    EMAIL = 'EMAIL',
    WHATSAPP = 'WHATSAPP',
}

export class SendPasswordResetDto {
    @IsString()
    @IsNotEmpty()
    identifier!: string;

    @IsEnum(PasswordResetChannel)
    channel!: PasswordResetChannel;
}
