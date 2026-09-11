import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

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

    @Get(':id/view')
    async view(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.viewDevolucaoNfe(id, user);
    }

    @Get(':id')
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.findDevolucaoNfeById(id, user);
    }

    @Patch(':id/cancel')
    async cancel(@Param('id') id: string, @CurrentUser() user: any) {
        return this.devolucoesService.cancelDraft(id, user);
    }
}
