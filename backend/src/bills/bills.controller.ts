import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';

import {
    BillStatus,
} from '@prisma/client';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { UpdateBillDto } from './dto/update-bill.dto';

const uploadPath = join(
    process.cwd(),
    'uploads',
    'bills',
);

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, {
        recursive: true,
    });
}

@Controller('bills')
@UseGuards(JwtAuthGuard)
export class BillsController {
    constructor(private billsService: BillsService) { }

    @Post()
    async create(
        @Body() body: CreateBillDto,
        @CurrentUser() user: any,
    ) {
        return this.billsService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('status') status?: BillStatus,
        @Query('storeId') storeId?: string,
        @Query('purchaseId') purchaseId?: string,
        @Query('supplierId') supplierId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.billsService.findAll(user, {
            status,
            storeId,
            purchaseId,
            supplierId,
            startDate,
            endDate,
        });
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.billsService.findOne(id, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateBillDto,
        @CurrentUser() user: any,
    ) {
        return this.billsService.update(id, body, user);
    }

    @Patch(':id/pay')
    async markAsPaid(
        @Param('id') id: string,
        @Body()
        body: { paidAt?: string; reconciliationNote?: string },
        @CurrentUser() user: any,
    ) {
        return this.billsService.markAsPaid(
            id,
            user,
            body?.paidAt,
            body?.reconciliationNote,
        );
    }

    @Patch(':id/launch')
    async markAsLaunched(
        @Param('id') id: string,
        @Body()
        body: {
            externalSystemName?: string;
            externalCode?: string;
        },
        @CurrentUser() user: any,
    ) {
        return this.billsService.markAsLaunched(
            id,
            user,
            body,
        );
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.billsService.remove(id, user);
    }

    @Post('upload')
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
                ];

                if (!allowedTypes.includes(file.mimetype)) {
                    return callback(
                        new Error(
                            'Arquivo inválido. Envie imagem ou PDF.',
                        ),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async upload(
        @UploadedFile() file: Express.Multer.File,
    ) {
        return {
            fileUrl: `/uploads/bills/${file.filename}`,
            originalName: file.originalname,
            mimeType: file.mimetype,
        };
    }

    // Lê o extrato OFX só pra devolver as movimentações — não salva o
    // arquivo nem grava nada no banco. A conciliação de fato acontece
    // quando o usuário confirma cada conta pelo endpoint de pagamento.
    @Post('reconcile/import')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, callback) => {
                const isOfx = /\.(ofx)$/i.test(
                    file.originalname || '',
                );

                if (!isOfx) {
                    return callback(
                        new Error(
                            'Arquivo inválido. Envie um extrato .ofx.',
                        ),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async importOfx(
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.billsService.parseOfxStatement(
            file.buffer.toString('utf-8'),
        );
    }
}