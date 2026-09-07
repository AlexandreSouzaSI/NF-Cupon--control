import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Res,
    UploadedFile,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import type { Response } from 'express';
import archiver from 'archiver';
import { PurchaseCategory, PurchaseStatus } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PurchasesService } from './purchases.service';
import { PurchaseVoiceService } from './purchase-voice.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateFiscalDocumentDto } from './dto/create-fiscal-document.dto';
import { ReceivePurchaseDto } from './dto/receive-purchase.dto';
import { AcceptIncomingNfDto } from './dto/accept-incoming-nf.dto';

const uploadPath = join(process.cwd(), 'uploads', 'fiscal-documents');

if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
}

const orderMirrorUploadPath = join(process.cwd(), 'uploads', 'purchase-mirrors');

if (!existsSync(orderMirrorUploadPath)) {
    mkdirSync(orderMirrorUploadPath, { recursive: true });
}

const orderMirrorInterceptor = FileInterceptor('file', {
    storage: diskStorage({
        destination: (_req, _file, callback) => {
            callback(null, orderMirrorUploadPath);
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

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchasesController {
    constructor(
        private purchasesService: PurchasesService,
        private purchaseVoiceService: PurchaseVoiceService,
    ) { }

    @Post()
    async create(
        @Body() body: CreatePurchaseDto,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.create(body, user);
    }

    // Cadastro de compra por voz: recebe o áudio gravado no navegador,
    // transcreve e devolve um rascunho pra preencher o formulário — não
    // cria a compra sozinho, quem confirma e salva é sempre a pessoa.
    @Post('voice-draft')
    @UseInterceptors(
        FileInterceptor('audio', {
            storage: memoryStorage(),
            limits: { fileSize: 20 * 1024 * 1024 },
            fileFilter: (_req, file, callback) => {
                if (!file.mimetype.startsWith('audio/')) {
                    return callback(
                        new Error('Envie um arquivo de áudio.'),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async voiceDraft(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('Nenhum áudio recebido.');
        }

        return this.purchaseVoiceService.buildDraftFromAudio(
            file.buffer,
            file.mimetype,
        );
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('status') status?: PurchaseStatus,
        @Query('storeId') storeId?: string,
        @Query('supplierId') supplierId?: string,
        @Query('category') category?: PurchaseCategory,
    ) {
        return this.purchasesService.findAll(user, {
            status,
            storeId,
            supplierId,
            category,
        });
    }

    @Get('waiting-invoices')
    async waitingInvoices(@CurrentUser() user: any) {
        return this.purchasesService.findWaitingInvoices(user);
    }

    @Get('pending-approvals')
    async pendingApprovals(@CurrentUser() user: any) {
        return this.purchasesService.findPendingApprovals(user);
    }

    // NF-e de mercadoria baixada automaticamente da Sefaz. accepted=true
    // devolve a aba "NFs Aceitas" (vinculada, aceita sem conta ou aceita
    // com conta); por padrão (ou accepted=false) devolve só as pendentes.
    @Get('incoming-goods-nf')
    async findIncomingGoodsNf(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('accepted') accepted?: string,
    ) {
        return this.purchasesService.findIncomingGoodsNf(user, {
            storeId,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            accepted: accepted === 'true',
        });
    }

    // Precisa vir antes de qualquer rota "incoming-goods-nf/:id/..." pra não
    // ser interpretada como um id.
    @Get('incoming-goods-nf/download/zip')
    async downloadIncomingGoodsNfZip(
        @CurrentUser() user: any,
        @Res() res: Response,
        @Query('storeId') storeId?: string,
        @Query('month') month?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const items = await this.purchasesService.findGoodsForDownload(user, {
            storeId,
            month,
            startDate,
            endDate,
        });

        const zipName = month ? `nf-entrada-${month}.zip` : 'nf-entrada.zip';

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

        for (const item of items) {
            if (!item.fileUrl) {
                continue;
            }

            const relativePath = item.fileUrl.replace(/^\/uploads\//, '');
            const filePath = join(process.cwd(), 'uploads', relativePath);

            if (!existsSync(filePath)) {
                continue;
            }

            const ext = extname(filePath) || '.xml';

            let baseName = `${new Date(item.date)
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

    // Busca (produção Sefaz) as NF-e novas emitidas pro CNPJ da loja desde
    // o último NSU salvo.
    @Post('incoming-goods-nf/sync')
    async syncIncomingGoodsNf(
        @CurrentUser() user: any,
        @Body('storeId') storeId: string,
    ) {
        return this.purchasesService.syncIncomingGoodsNf(storeId, user);
    }

    // Fallback manual: importa vários XMLs de NF-e de compra de uma vez só,
    // pra quando a busca automática na Sefaz não estiver disponível.
    @Post('incoming-goods-nf/import-xml')
    @UseInterceptors(
        FilesInterceptor('files', 50, {
            storage: memoryStorage(),
            limits: { fileSize: 5 * 1024 * 1024 },
            fileFilter: (_req, file, callback) => {
                if (
                    !file.originalname.toLowerCase().endsWith('.xml') &&
                    file.mimetype !== 'text/xml' &&
                    file.mimetype !== 'application/xml'
                ) {
                    return callback(new Error('Envie apenas arquivos XML.'), false);
                }

                callback(null, true);
            },
        }),
    )
    async importGoodsNfXml(
        @UploadedFiles() files: Express.Multer.File[],
        @Body('storeId') storeId: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.importGoodsNfXml(storeId, files, user);
    }

    @Post('incoming-goods-nf/:id/link')
    async linkIncomingGoodsNf(
        @Param('id') id: string,
        @Body('purchaseId') purchaseId: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.linkIncomingGoodsNf(
            id,
            purchaseId,
            user,
        );
    }

    @Post('incoming-goods-nf/:id/ignore')
    async ignoreIncomingGoodsNf(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.ignoreIncomingGoodsNf(id, user);
    }

    @Post('incoming-goods-nf/:id/accept')
    async acceptIncomingGoodsNf(
        @Param('id') id: string,
        @Body() body: AcceptIncomingNfDto,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.acceptIncomingGoodsNf(id, body, user);
    }

    @Get('incoming-goods-nf/:id/view')
    async viewIncomingGoodsNf(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.viewIncomingGoodsNf(id, user);
    }

    @Get(':id')
    async findOne(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.findOne(id, user);
    }

    @Post(':id/approve')
    async approve(
        @Param('id') id: string,
        @Body() body: { comment?: string },
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.approve(id, user, body?.comment);
    }

    @Post(':id/reject')
    async reject(
        @Param('id') id: string,
        @Body() body: { comment?: string },
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.reject(id, user, body?.comment);
    }

    @Post(':id/check')
    async check(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.check(id, user);
    }

    @Post(':id/close')
    async close(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.close(id, user);
    }

    @Post(':id/fiscal-documents')
    async addFiscalDocument(
        @Param('id') id: string,
        @Body() body: CreateFiscalDocumentDto,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.addFiscalDocument(id, body, user);
    }

    @Get(':id/fiscal-documents')
    async findFiscalDocuments(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.findFiscalDocuments(id, user);
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
                        new Error('Arquivo inválido. Envie imagem, PDF ou XML.'),
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
        @CurrentUser() user: any,
    ) {
        const fileUrl = `/uploads/fiscal-documents/${file.filename}`;

        return this.purchasesService.addFiscalDocument(
            id,
            {
                ...body,
                fileUrl,
                value: body.value ? Number(body.value) : undefined,
            },
            user,
        );
    }

    @Post(':id/order-mirror')
    @UseInterceptors(orderMirrorInterceptor)
    async uploadOrderMirror(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @CurrentUser() user: any,
    ) {
        if (!file) {
            throw new BadRequestException('Nenhum arquivo recebido.');
        }

        return this.purchasesService.attachOrderMirror(
            id,
            {
                url: `/uploads/purchase-mirrors/${file.filename}`,
                name: file.originalname,
            },
            user,
        );
    }

    @Post(':id/receive')
    async receive(
        @Param('id') id: string,
        @Body() body: ReceivePurchaseDto,
        @CurrentUser() user: any,
    ) {
        return this.purchasesService.receive(
            id,
            body,
            user,
        );
    }
}