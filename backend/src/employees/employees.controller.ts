import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto';

const uploadPath = join(process.cwd(), 'uploads', 'employees');

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
}

const receiptInterceptor = FileInterceptor('file', {
    storage: diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, uploadPath);
        },
        filename: (_req, file, callback) => {
            const uniqueName = `${Date.now()}-${Math.round(
                Math.random() * 1e9,
            )}${extname(file.originalname)}`;

            callback(null, uniqueName);
        },
    }),
    fileFilter: (_req, file, callback) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf',
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error('Arquivo inválido. Envie imagem ou PDF.'),
                false,
            );
        }

        callback(null, true);
    },
});

// Dados sensíveis (folha de pagamento) — só ADMINISTRATIVO/PROPRIETARIO
// chegam em qualquer rota deste controller.
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
export class EmployeesController {
    constructor(private employeesService: EmployeesService) { }

    @Post()
    async create(
        @Body() body: CreateEmployeeDto,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('name') name?: string,
        @Query('onlyActive') onlyActive?: string,
    ) {
        return this.employeesService.findAll(user, {
            storeId,
            name,
            onlyActive: onlyActive === 'true',
        });
    }

    // Dispara a geração dos lançamentos (adiantamento/pagamento/vale
    // transporte/premiação) do mês atual e do próximo, pros funcionários
    // ativos no escopo do usuário. Idempotente.
    @Post('generate-launches')
    async generateLaunches(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.employeesService.generateLaunches(user, { storeId });
    }

    // Precisa vir antes de ":id" pra não ser interpretada como um id.
    @Get('payments')
    async findPayments(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('status') status?: string,
        @Query('type') type?: string,
        @Query('employeeId') employeeId?: string,
    ) {
        return this.employeesService.findPayments(user, {
            storeId,
            status,
            type,
            employeeId,
        });
    }

    @Post('payments')
    @UseInterceptors(receiptInterceptor)
    async createManualPayment(
        @Body() body: CreateEmployeePaymentDto,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        const receiptFileUrl = file
            ? `/uploads/employees/${file.filename}`
            : undefined;

        return this.employeesService.createManualPayment(
            body,
            user,
            receiptFileUrl,
        );
    }

    @Put('payments/:id')
    async updatePayment(
        @Param('id') id: string,
        @Body() body: UpdateEmployeePaymentDto,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.updatePayment(id, body, user);
    }

    @Post('payments/:id/pay')
    @UseInterceptors(receiptInterceptor)
    async markPaid(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        const receiptFileUrl = file
            ? `/uploads/employees/${file.filename}`
            : undefined;

        return this.employeesService.markPaid(id, user, receiptFileUrl);
    }

    @Post('payments/:id/reopen')
    async reopenPayment(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.reopenPayment(id, user);
    }

    @Delete('payments/:id')
    async removePayment(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.removePayment(id, user);
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.findOne(id, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateEmployeeDto,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.update(id, body, user);
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.employeesService.remove(id, user);
    }
}
