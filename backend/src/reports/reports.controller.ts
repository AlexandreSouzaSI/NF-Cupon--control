import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ReportsService } from './reports.service';

// Mesmos perfis que veem "Relatórios" no menu (lib/menu.ts) — faltava o
// RolesGuard aqui, então qualquer perfil autenticado conseguia puxar os
// relatórios direto pela API mesmo sem o item aparecer pra ele.
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
@RequiresModule(StoreModule.RELATORIOS)
export class ReportsController {
    constructor(private reportsService: ReportsService) { }

    @Get('suppliers')
    async suppliers(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.reportsService.suppliers(user, storeId);
    }

    @Get('stores')
    async stores(
        @CurrentUser() user: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.stores(user, {
            startDate,
            endDate,
        });
    }

    @Get('cards')
    async cards(
        @CurrentUser() user: any,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        return this.reportsService.cards(user, {
            startDate,
            endDate,
        });
    }
}