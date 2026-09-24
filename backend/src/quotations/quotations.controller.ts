import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { StoreModule, UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequiresModule } from '../auth/requires-module.decorator';
import { ModuleAccessGuard } from '../auth/module-access.guard';

import { QuotationsService } from './quotations.service';
import { CreateScheduleEntryDto } from './dto/create-schedule-entry.dto';
import { CreateCategoryItemDto } from './dto/create-category-item.dto';
import { UpdateCategoryItemDto } from './dto/update-category-item.dto';
import { SendQuotationDto } from './dto/send-quotation.dto';
import { SelectSupplierDto } from './dto/select-supplier.dto';

// Mesmo espírito de acesso do módulo Compras/Estoque — quem monta a
// agenda e dispara cotação é Administrativo/Proprietário/Gerente/Comprador.
@Controller('quotations')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.COTACAO)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
)
export class QuotationsController {
    constructor(private quotationsService: QuotationsService) { }

    // --- Agenda fixa por dia da semana ---

    @Get('schedule')
    async listSchedule(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.quotationsService.listSchedule(user, storeId);
    }

    @Post('schedule')
    async createScheduleEntry(
        @Body() body: CreateScheduleEntryDto,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.createScheduleEntry(body, user);
    }

    @Delete('schedule/:id')
    async removeScheduleEntry(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.removeScheduleEntry(id, user);
    }

    @Get('today')
    async listToday(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
    ) {
        return this.quotationsService.listToday(user, storeId);
    }

    // --- Lista sugerida (preview, por categoria) ---

    @Get('suggested-list')
    async suggestedList(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('categoryId') categoryId: string,
    ) {
        return this.quotationsService.suggestedList(user, storeId, categoryId);
    }

    // --- Edição da lista (add/editar/remover item) ---

    @Post('category-items')
    async addCategoryItem(
        @Body() body: CreateCategoryItemDto,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.addCategoryItem(body, user);
    }

    @Patch('category-items/:id')
    async updateCategoryItem(
        @Param('id') id: string,
        @Body() body: UpdateCategoryItemDto,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.updateCategoryItem(id, body, user);
    }

    @Delete('category-items/:id')
    async removeCategoryItem(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.removeCategoryItem(id, user);
    }

    // --- Envio da cotação pro WhatsApp dos fornecedores (Fase 3) ---

    @Get('candidate-suppliers')
    async candidateSuppliers(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('categoryId') categoryId: string,
    ) {
        return this.quotationsService.candidateSuppliers(
            user,
            storeId,
            categoryId,
        );
    }

    @Post('send')
    async sendQuotation(
        @Body() body: SendQuotationDto,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.sendQuotation(body, user);
    }

    // --- Comparação + escolha do fornecedor vencedor (Fase 5) ---
    // Rotas com :id ficam por último de propósito — senão o Nest tentaria
    // casar "schedule", "today" etc como se fossem um :id.

    @Get()
    async listQuotations(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('status') status?: string,
    ) {
        return this.quotationsService.listQuotations(user, storeId, status);
    }

    @Get(':id')
    async getQuotationDetail(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.getQuotationDetail(user, id);
    }

    @Post(':id/select-supplier')
    async selectSupplier(
        @Param('id') id: string,
        @Body() body: SelectSupplierDto,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.selectSupplier(id, body, user);
    }

    // --- Confirmação do pedido pelo fornecedor vencedor (Fase 6) ---

    @Post(':id/request-order-confirmation')
    async requestOrderConfirmation(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ) {
        return this.quotationsService.requestOrderConfirmation(id, user);
    }
}
