import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

@Module({
    controllers: [EmployeesController],
    providers: [EmployeesService, PrismaService],
    exports: [EmployeesService],
})
export class EmployeesModule { }
