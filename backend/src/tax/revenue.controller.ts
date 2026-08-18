import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';

import { RevenueService } from './revenue.service';
import { CreateRevenueEntryDto } from './dto/create-revenue-entry.dto';
import { UpdateRevenueEntryDto } from './dto/update-revenue-entry.dto';

// Faturamento é dado financeiro estratégico (base de todo o cálculo de
// tributo) — acesso mais restrito que Contas a Pagar, no mesmo espírito da
// folha de pagamento: administrativo, proprietário e financeiro.
@Controller('revenue-entries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
    UserRole.COMPRADOR,
    UserRole.FINANCEIRO,
)
export class RevenueController {
    constructor(private revenueService: RevenueService) { }

    @Post()
    async create(
        @Body() body: CreateRevenueEntryDto,
        @CurrentUser() user: any,
    ) {
        return this.revenueService.create(body, user);
    }

    @Get()
    async findAll(
        @CurrentUser() user: any,
        @Query('storeId') storeId?: string,
    ) {
        return this.revenueService.findAll(user, { storeId });
    }

    @Get('rbt12')
    async getRbt12(
        @CurrentUser() user: any,
        @Query('storeId') storeId: string,
        @Query('referenceMonth') referenceMonth: string,
    ) {
        return this.revenueService.getRbt12(storeId, referenceMonth, user);
    }

    @Put(':id')
    async update(
        @Param('id') id: string,
        @Body() body: UpdateRevenueEntryDto,
        @CurrentUser() user: any,
    ) {
        return this.revenueService.update(id, body, user);
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.revenueService.remove(id, user);
    }
}
