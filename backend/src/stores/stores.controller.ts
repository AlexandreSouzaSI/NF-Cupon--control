import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { StoresService } from './stores.service';
import { LinkUserStoreDto } from './dto/link-user-store.dto';

@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StoresController {
    constructor(private storesService: StoresService) { }

    @Post()
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
    async create(@Body() body: CreateStoreDto) {
        return this.storesService.create(body);
    }

    @Get()
    async findAll(@Req() req: any) {
        return this.storesService.findAll(req.user);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @Req() req: any) {
        return this.storesService.findOne(id, req.user);
    }

    @Put(':id')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async update(
        @Param('id') id: string,
        @Body() body: UpdateStoreDto,
        @Req() req: any,
    ) {
        return this.storesService.update(id, body, req.user);
    }

    @Delete(':id')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
    async remove(@Param('id') id: string) {
        return this.storesService.remove(id);
    }

    @Post(':id/users')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
    async linkUser(
        @Param('id') storeId: string,
        @Body() body: LinkUserStoreDto,
    ) {
        return this.storesService.linkUser(storeId, body.userId);
    }

    @Delete(':id/users/:userId')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO)
    async unlinkUser(
        @Param('id') storeId: string,
        @Param('userId') userId: string,
    ) {
        return this.storesService.unlinkUser(storeId, userId);
    }

    // Certificado digital (e-CNPJ) usado futuramente pra autenticar nas
    // APIs da Sefaz/NFS-e Nacional. Só metadado (nome do arquivo, data) é
    // devolvido — a senha e o caminho do arquivo nunca saem do backend.
    @Get(':id/certificate')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async getCertificateStatus(@Param('id') id: string, @Req() req: any) {
        return this.storesService.getCertificateStatus(id, req.user);
    }

    @Post(':id/certificate')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    @UseInterceptors(
        FileInterceptor('file', {
            storage: memoryStorage(),
            fileFilter: (_req, file, callback) => {
                const isValid = /\.(pfx|p12)$/i.test(
                    file.originalname || '',
                );

                if (!isValid) {
                    return callback(
                        new Error(
                            'Arquivo inválido. Envie um certificado .pfx ou .p12.',
                        ),
                        false,
                    );
                }

                callback(null, true);
            },
        }),
    )
    async uploadCertificate(
        @Param('id') id: string,
        @UploadedFile() file: Express.Multer.File,
        @Body('password') password: string,
        @Req() req: any,
    ) {
        return this.storesService.saveCertificate(
            id,
            file,
            password,
            req.user,
        );
    }

    @Delete(':id/certificate')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async removeCertificate(@Param('id') id: string, @Req() req: any) {
        return this.storesService.removeCertificate(id, req.user);
    }

    // Só testa se o certificado autentica na Sefaz (ambiente de
    // homologação) — não busca nem grava nenhuma NF ainda.
    @Post(':id/certificate/test-connection')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async testCertificateConnection(@Param('id') id: string, @Req() req: any) {
        return this.storesService.testCertificateConnection(id, req.user);
    }

    // Temporário: ajuda a descobrir o endereço certo da API da Sefaz.
    @Post(':id/certificate/diagnostics')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async runCertificateDiagnostics(@Param('id') id: string, @Req() req: any) {
        return this.storesService.runCertificateDiagnostics(id, req.user);
    }

    // Testa se o certificado autentica no webservice de NF-e de mercadoria
    // (produção nacional) — serviço diferente do de NFS-e acima.
    @Post(':id/certificate/test-goods-connection')
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async testGoodsConnection(@Param('id') id: string, @Req() req: any) {
        return this.storesService.testGoodsConnection(id, req.user);
    }
}