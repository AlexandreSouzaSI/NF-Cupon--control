import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FreelancersController } from './freelancers.controller';
import { FreelancersService } from './freelancers.service';

@Module({
    controllers: [FreelancersController],
    providers: [FreelancersService, PrismaService],
})
export class FreelancersModule { }
