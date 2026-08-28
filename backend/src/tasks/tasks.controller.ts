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
import { TaskOccurrenceStatus, UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ConfirmOccurrenceDto } from './dto/confirm-occurrence.dto';

const uploadPath = join(process.cwd(), 'uploads', 'tasks');

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
}

const attachmentInterceptor = FileInterceptor('attachment', {
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
    limits: { fileSize: 15 * 1024 * 1024 },
});

// Página aberta a todos os perfis, mas o service filtra o que cada um
// enxerga: Administrativo/Proprietário veem tudo da loja, os demais só o
// que criaram ou o que foi atribuído a eles. As ações de gerenciar
// (criar/editar/remover/desfazer) exigem Administrativo/Proprietário/
// Gerente, restrito por método abaixo.
@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
    constructor(private tasksService: TasksService) { }

    @Post()
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    @UseInterceptors(attachmentInterceptor)
    async create(
        @Body() body: CreateTaskDto,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        const attachment = file
            ? { url: `/uploads/tasks/${file.filename}`, name: file.originalname }
            : undefined;

        return this.tasksService.create(body, user, attachment);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('assignedToId') assignedToId?: string,
        @Query('active') active?: string,
    ) {
        return this.tasksService.findAll(user, {
            storeId,
            assignedToId,
            active: active === undefined ? undefined : active === 'true',
        });
    }

    // Rota de path fixo precisa vir antes de ":id" pra não ser
    // interpretada como um id.
    @Get('occurrences')
    async findOccurrences(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('assignedToId') assignedToId?: string,
        @Query('status') status?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
    ) {
        return this.tasksService.findOccurrences(user, {
            storeId,
            assignedToId,
            status: status
                ? (status.split(',') as TaskOccurrenceStatus[])
                : undefined,
            from,
            to,
        });
    }

    @Post('occurrences/:id/confirm')
    @UseInterceptors(attachmentInterceptor)
    async confirmOccurrence(
        @Param('id') id: string,
        @Body() body: ConfirmOccurrenceDto,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        const attachment = file
            ? { url: `/uploads/tasks/${file.filename}`, name: file.originalname }
            : undefined;

        return this.tasksService.confirmOccurrence(id, body, attachment, user);
    }

    @Post('occurrences/:id/start')
    async startOccurrence(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.startOccurrence(id, user);
    }

    @Post('occurrences/:id/pause')
    async pauseOccurrence(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.pauseOccurrence(id, user);
    }

    @Post('occurrences/:id/resume')
    async resumeOccurrence(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.resumeOccurrence(id, user);
    }

    @Post('occurrences/:id/undo')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async undoConfirmation(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.undoConfirmation(id, user);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.tasksService.findOne(id, user);
    }

    @Put(':id')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async update(
        @Param('id') id: string,
        @Body() body: UpdateTaskDto,
        @CurrentUser() user: any,
    ) {
        return this.tasksService.update(id, body, user);
    }

    @Delete(':id')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.tasksService.remove(id, user);
    }
}
