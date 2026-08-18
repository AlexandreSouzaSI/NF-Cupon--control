import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { FreelancersService } from './freelancers.service';
import { CreateFreelancerDto } from './dto/create-freelancer.dto';
import { UpdateFreelancerDto } from './dto/update-freelancer.dto';
import { SetWorkDaysDto } from './dto/set-work-days.dto';
import { ConfirmFreelancerPaymentDto } from './dto/confirm-payment.dto';

// Diferente de Funcionários (RH): Gerente também tem acesso aqui.
@Controller('freelancers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
export class FreelancersController {
    constructor(private freelancersService: FreelancersService) { }

    @Post()
    async create(@Body() body: CreateFreelancerDto, @CurrentUser() user: any) {
        return this.freelancersService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('onlyActive') onlyActive?: string,
    ) {
        return this.freelancersService.findAll(user, {
            storeId,
            onlyActive: onlyActive === 'true',
        });
    }

    // Rotas de path fixo precisam vir antes de ":id" pra não serem
    // interpretadas como um id.
    @Get('payments-summary')
    async getPaymentsSummary(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('weekStart') weekStart: string,
    ) {
        return this.freelancersService.getPaymentsSummary(
            storeId,
            weekStart,
            user,
        );
    }

    @Get('payments-report')
    async findPaymentsReport(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('freelancerId') freelancerId?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.freelancersService.findPaymentsReport(user, {
            storeId,
            freelancerId,
            from,
            to,
        });
    }

    @Delete('payments/:paymentId')
    async removePaymentConfirmation(
        @Param('paymentId') paymentId: string,
        @CurrentUser() user: any,
    ) {
        return this.freelancersService.removePaymentConfirmation(
            paymentId,
            user,
        );
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.freelancersService.findOne(id, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateFreelancerDto,
        @CurrentUser() user: any,
    ) {
        return this.freelancersService.update(id, body, user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.freelancersService.remove(id, user);
    }

    @Get(':id/work-days')
    async findWorkDays(
        @Param('id') id: string,
        @Query('weekStart') weekStart: string,
        @CurrentUser() user: any,
    ) {
        return this.freelancersService.findWorkDays(id, weekStart, user);
    }

    @Put(':id/work-days')
    async setWorkDays(
        @Param('id') id: string,
        @Body() body: SetWorkDaysDto,
        @CurrentUser() user: any,
    ) {
        return this.freelancersService.setWorkDays(id, body, user);
    }

    @Post(':id/payments/confirm')
    async confirmPayment(
        @Param('id') id: string,
        @Body() body: ConfirmFreelancerPaymentDto,
        @CurrentUser() user: any,
    ) {
        return this.freelancersService.confirmPayment(id, body, user);
    }
}
