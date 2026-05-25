import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { PurchaseStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { PurchasesService } from './purchases.service';

import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';

const uploadPath = join(
    process.cwd(),
    'uploads',
    'fiscal-documents',
);

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, {
        recursive: true,
    });
}

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
    constructor(private purchasesService: PurchasesService) { }

    @Post()
    async create(
        @Body() body: CreatePurchaseDto,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.create(body, user);
    }

    @Get('waiting-invoices')
    async waitingInvoices() {
        return this.purchasesService.findWaitingInvoices();
    }

    @Get('pending-approvals')
    async pendingApprovals() {
        return this.purchasesService.findPendingApprovals();
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        return this.purchasesService.findOne(id);
    }

    @Post(':id/check')
    async check(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.check(
            id,
        );
    }

    @Post(':id/close')
    async close(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.close(
            id,
        );
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('status') status?: PurchaseStatus,
        @Query('storeId') storeId?: string,
        @Query('supplierId') supplierId?: string,
    ) {
        return this.purchasesService.findAll(user, {
            status,
            storeId,
            supplierId,
        });
    }

    @Post(':id/fiscal-documents/upload')
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
    async uploadFiscalDocument(
        @Param('id') id: string,
        @Body() body: CreateFiscalDocumentDto,
        @UploadedFile() file: Express.Multer.File,
    ) {
        const fileUrl = `/uploads/fiscal-documents/${file.filename}`;

        return this.purchasesService.addFiscalDocument(id, {
            ...body,
            fileUrl,
            value: body.value ? Number(body.value) : undefined,
        });
    }

    @Post(':id/approve')
    async approve(
        @Param('id') id: string,
        @Body() body: { comment?: string },
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.approve(
            id,
            user,
            body?.comment,
        );
    }

    @Post(':id/reject')
    async reject(
        @Param('id') id: string,
        @Body() body: { comment?: string },
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.reject(
            id,
            user,
            body?.comment,
        );
    }

    @Post(':id/fiscal-documents')
    async addFiscalDocument(
        @Param('id') id: string,
        @Body() body: CreateFiscalDocumentDto,
    ) {
        return this.purchasesService.addFiscalDocument(id, body);
    }

    @Get(':id/fiscal-documents')
    async findFiscalDocuments(@Param('id') id: string) {
        return this.purchasesService.findFiscalDocuments(id);
    }
}