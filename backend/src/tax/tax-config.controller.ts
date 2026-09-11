import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
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

import { TaxConfigService } from './tax-config.service';
import { CreateTaxRegimeConfigDto } from './dto/create-tax-regime-config.dto';

// Gerente fora daqui de propósito — Tributos é acesso restrito
// (Administrativo/Proprietário/Comprador/Financeiro).
@Controller('tax-regime-configs')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleAccessGuard)
@RequiresModule(StoreModule.TRIBUTOS)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.COMPRADOR,
    UserRole.FINANCEIRO,
)
export class TaxConfigController {
    constructor(private taxConfigService: TaxConfigService) { }

    @Post()
    async create(
        @Body() body: CreateTaxRegimeConfigDto,
        @CurrentUser() user: any,
    ) {
        return this.taxConfigService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.taxConfigService.findAll(user, { storeId });
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.taxConfigService.remove(id, user);
    }
}
