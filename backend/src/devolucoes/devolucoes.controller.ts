import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { DevolucoesService } from './devolucoes.service';
import { CreateDevolucaoNfeDto } from './dto/create-devolucao-nfe.dto';

// Mesmo grupo de perfis que já mexe com NF de entrada/perda no dia a dia
// — Financeiro não participa desse fluxo operacional.
@Controller('devolucoes')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.NOTAS_FISCAIS)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.ESTOQUISTA,
)
export class DevolucoesController {
    constructor(private devolucoesService: DevolucoesService) { }

    // Itens disponíveis pra devolução de uma NF de entrada específica —
    // é dessa lista que a tela monta os checkboxes de seleção de item.
    @Get('incoming-nf/:id/items')
    async getIncomingNfItems(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.getIncomingNfItems(id, user);
    }

    @Post()
    async create(@Body() body: CreateDevolucaoNfeDto, @CurrentUser() user: any) {
        return this.devolucoesService.createDevolucaoDraft(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any, @Query('storeId') storeId?: string) {
        return this.devolucoesService.findDevolucaoNfes(user, storeId);
    }

    // Último "Motivo" usado numa devolução envolvendo esse mesmo item
    // (por descrição, vinda do XML da NF de entrada) — pré-preenche o
    // campo "Motivo da devolução", editável. Precisa vir antes de
    // ":id/view" pra "last-motivo" não ser interpretado como um id.
    @Get('last-motivo')
    async getLastMotivo(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('description') description: string,
    ) {
        return this.devolucoesService.getLastMotivo(user, storeId, description);
    }

    @Get(':id/view')
    async view(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.viewDevolucaoNfe(id, user);
    }

    @Get(':id/danfe')
    async downloadDanfe(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Res() res: Response,
    ) {
        const buffer = await this.devolucoesService.downloadDevolucaoNfeDanfe(id, user);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="danfe-devolucao-${id}.pdf"`,
        });
        res.send(buffer);
    }

    @Get(':id/xml')
    async downloadXml(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Res() res: Response,
    ) {
        const { buffer, filename } = await this.devolucoesService.downloadDevolucaoNfeXml(id, user);

        res.set({
            'Content-Type': 'application/xml',
            'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.send(buffer);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.findDevolucaoNfeById(id, user);
    }

    // Body.justificativa só é obrigatório quando a NF já está AUTORIZADA
    // na Sefaz (dispara o evento de cancelamento de verdade).
    @Patch(':id/cancel')
    async cancel(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Body('justificativa') justificativa?: string,
    ) {
        return this.devolucoesService.cancelDraft(id, user, justificativa);
    }

    // Envia de verdade pro webservice de autorização da Sefaz (sempre
    // homologação por enquanto — ver comentário no service). Pode ser
    // chamado de novo se a tentativa anterior ficou "pendente".
    @Post(':id/send')
    async send(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.sendDevolucaoNfeToSefaz(id, user);
    }
}
