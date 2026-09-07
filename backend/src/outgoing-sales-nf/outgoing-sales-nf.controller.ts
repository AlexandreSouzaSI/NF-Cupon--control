import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { OutgoingSalesNfService } from './outgoing-sales-nf.service';

// Mesma restrição de acesso do Faturamento (revenue-entries) — a nota de
// saída alimenta esse dado direto, então quem pode ver/importar aqui é
// quem já pode mexer em Faturamento.
@Controller('outgoing-sales-nf')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.FINANCEIRO,
)
export class OutgoingSalesNfController {
    constructor(private outgoingSalesNfService: OutgoingSalesNfService) { }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.outgoingSalesNfService.findAll(user, { storeId });
    }

    @Post('import-xml')
    @UseInterceptors(
        FilesInterceptor('files', 200, {
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
    async importXml(
        @UploadedFiles() files: Express.Multer.File[],
        @Body('storeId') storeId: string,
        @CurrentUser() user: any,
    ) {
        return this.outgoingSalesNfService.importXml(storeId, files, user);
    }

    @Post(':id/ignore')
    async ignore(@Param('id') id: string, @CurrentUser() user: any) {
        return this.outgoingSalesNfService.ignore(id, user);
    }

    @Get(':id/view')
    async view(@Param('id') id: string, @CurrentUser() user: any) {
        return this.outgoingSalesNfService.view(id, user);
    }
}
