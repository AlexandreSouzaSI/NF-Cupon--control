import { IsEnum, IsString } from 'class-validator';
import { FreelancerPaymentGroup } from '@prisma/client';

export class ConfirmFreelancerPaymentDto {
    @IsEnum(FreelancerPaymentGroup)
    group!: FreelancerPaymentGroup;

    // Terça-feira da semana sendo confirmada — mesma âncora usada no
    // resto da tela.
    @IsString()
    weekStart!: string;
}
