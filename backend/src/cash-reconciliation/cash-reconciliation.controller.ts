import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Res,
    UseGuards,
} from '@nestjs/common';

import type { Response } from 'express';

import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { CashReconciliationService } from './cash-reconciliation.service';
import { UpsertCashReconciliationDto } from './dto/upsert-cash-reconciliation.dto';

// Módulo próprio CONCILIACAO_CAIXA — antes reaproveitava CONTAS_A_PAGAR,
// separado pra dar um quadradinho independente em Cadastros →
// Colaboradores (ver comentário do grupo "Financeiro" em
// frontend/lib/menu.ts). Gerente fica de fora de propósito, mesmo
// critério já usado em Contas a Pagar/Tributos (acesso financeiro
// restrito ao time administrativo).
@Controller('cash-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.FINANCEIRO)
@RequiresModule(StoreModule.CONCILIACAO_CAIXA)
export class CashReconciliationController {
    constructor(
        private cashReconciliationService: CashReconciliationService,
    ) { }

    @Post()
    upsert(
        @Body() dto: UpsertCashReconciliationDto,
        @CurrentUser() user: any,
    ) {
        return this.cashReconciliationService.upsert(dto, user);
    }

    @Get()
    findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
    ) {
        return this.cashReconciliationService.findAll(
            storeId,
            user,
            page ? Number(page) : undefined,
            pageSize ? Number(pageSize) : undefined,
        );
    }

    // Precisa vir antes de @Get(':id') — senão "today" seria interpretado
    // como um :id.
    @Get('today')
    findToday(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.cashReconciliationService.findToday(storeId, user);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @CurrentUser() user: any) {
        return this.cashReconciliationService.findOne(id, user);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.cashReconciliationService.remove(id, user);
    }

    @Get(':id/report')
    async downloadReport(
        @Param('id') id: string,
        @CurrentUser() user: any,
        @Res() res: Response,
    ) {
        const buffer = await this.cashReconciliationService.getReportPdf(
            id,
            user,
        );
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="conciliacao-caixa-${id}.pdf"`,
        });
        res.send(buffer);
    }
}
