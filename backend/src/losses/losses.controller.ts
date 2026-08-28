import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
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

import { LossesService } from './losses.service';
import { CreateLossDto } from './dto/create-loss.dto';

const uploadPath = join(process.cwd(), 'uploads', 'losses');

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
}

const photoInterceptor = FileInterceptor('photo', {
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
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(new Error('Envie uma foto (JPEG, PNG ou WEBP).'), false);
        }

        callback(null, true);
    },
});

// Quem lida com o estoque/compras da loja no dia a dia — Financeiro não
// participa desse fluxo operacional. Funcionário também entra aqui: no
// projeto reduzido, Perdas é o único módulo operacional que esse perfil
// acessa.
@Controller('losses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
    UserRole.FUNCIONARIO,
)
export class LossesController {
    constructor(private lossesService: LossesService) { }

    @Post()
    @UseInterceptors(photoInterceptor)
    async create(
        @Body() body: CreateLossDto,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        const photoUrl = file ? `/uploads/losses/${file.filename}` : undefined;

        return this.lossesService.create(body, photoUrl, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('month') month?: string,
        @Query('year') year?: string,
    ) {
        return this.lossesService.findAll(user, {
            storeId,
            month: month ? Number(month) : undefined,
            year: year ? Number(year) : undefined,
        });
    }

    @Get('monthly-report')
    async monthlyReport(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('month') month: string,
        @Query('year') year: string,
    ) {
        return this.lossesService.monthlyReport(user, {
            storeId,
            month: Number(month),
            year: Number(year),
        });
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.lossesService.remove(id, user);
    }
}
