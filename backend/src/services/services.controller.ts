import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import type { Response } from 'express';
import archiver from 'archiver';

import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { AcceptIncomingNfDto } from './dto/accept-incoming-nf.dto';

const uploadPath = join(process.cwd(), 'uploads', 'services');

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
}

// Funcionário não participa do módulo de Serviços no projeto reduzido —
// o único perfil de fora deixado fora daqui.
@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
    UserRole.FINANCEIRO,
)
export class ServicesController {
    constructor(private servicesService: ServicesService) { }

    @Post()
    async create(
        @Body() body: CreateServiceDto,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('name') name?: string,
        @Query('month') month?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.servicesService.findAll(user, {
            storeId,
            name,
            month,
            startDate,
            endDate,
        });
    }

    // Precisa vir antes de ":id" pra não ser interpretada como um id.
    // Lista combinada usada na tela "NF de serviços": Service com NF anexada
    // + IncomingServiceNf aceita direto (sem passar por um Service).
    @Get('confirmed-nf')
    async findConfirmedNf(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.servicesService.findConfirmedNf(user, storeId);
    }

    // Precisa vir antes de ":id" pra não ser interpretada como um id.
    @Get('download/zip')
    async downloadZip(
        @CurrentUser() user: any,
        @Res() res: Response,
        @Query('storeId') storeId?: string,
        @Query('month') month?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const services = await this.servicesService.findForDownload(
            user,
            { storeId, month, startDate, endDate },
        );

        const zipName = month
            ? `nf-servicos-${month}.zip`
            : 'nf-servicos.zip';

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipName}"`,
        });

        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (error) => {
            res.status(500).end(String(error));
        });

        archive.pipe(res);

        const usedNames = new Set<string>();

        for (const item of services) {
            if (!item.fileUrl) {
                continue;
            }

            const relativePath = item.fileUrl.replace(
                /^\/uploads\//,
                '',
            );

            const filePath = join(
                process.cwd(),
                'uploads',
                relativePath,
            );

            if (!existsSync(filePath)) {
                continue;
            }

            const ext = extname(
                item.originalName || filePath,
            );

            let baseName = `${item.date
                .toISOString()
                .slice(0, 10)}-${item.providerName}`
                .replace(/[^a-zA-Z0-9-_ ]/g, '')
                .trim();

            let entryName = `${baseName}${ext}`;
            let counter = 2;

            while (usedNames.has(entryName)) {
                entryName = `${baseName}-${counter}${ext}`;
                counter += 1;
            }

            usedNames.add(entryName);

            archive.file(filePath, { name: entryName });
        }

        await archive.finalize();
    }

    // Dispara a busca de novas NFs na Sefaz pra loja informada. Só leitura
    // do lado da Sefaz; o que muda aqui é IncomingServiceNf/lastNsu.
    @Post('sync-sefaz')
    async syncFromSefaz(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.servicesService.syncFromSefaz(storeId, user);
    }

    // Precisa vir antes de ":id" pra não ser interpretada como um id.
    @Get('incoming-nf')
    async findIncomingNf(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('accepted') accepted?: string,
    ) {
        return this.servicesService.findIncomingNf(user, {
            storeId,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            accepted: accepted === 'true',
        });
    }

    @Post('incoming-nf/:id/reconcile')
    async reconcileIncomingNf(
        @Param('id') id: string,
        @Body('serviceId') serviceId: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.reconcileIncomingNf(
            id,
            serviceId,
            user,
        );
    }

    @Post('incoming-nf/:id/ignore')
    async ignoreIncomingNf(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.ignoreIncomingNf(id, user);
    }

    @Post('incoming-nf/:id/accept')
    async acceptIncomingNf(
        @Param('id') id: string,
        @Body() body: AcceptIncomingNfDto,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.acceptIncomingNf(id, body, user);
    }

    @Get('incoming-nf/:id/view')
    async viewIncomingNf(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.viewIncomingNf(id, user);
    }

    @Get(':id/view')
    async viewService(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.viewService(id, user);
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.findOne(id, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateServiceDto,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.update(id, body, user);
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.remove(id, user);
    }

    @Post(':id/nf/upload')
    @UseInterceptors(
        FileInterceptor('file', {
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
                    'text/xml',
                    'application/xml',
                ];

                if (!allowedTypes.includes(file.mimetype)) {
                    return callback(
                        new Error(
                            'Arquivo inválido. Envie imagem, PDF ou XML.',
                        ),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async uploadNf(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        return this.servicesService.attachNf(id, user, {
            fileUrl: `/uploads/services/${file.filename}`,
            originalName: file.originalname,
        });
    }
}
