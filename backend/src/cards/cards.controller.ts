import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminMasterGuard } from '../auth/admin-master.guard';

import { CardsService } from './cards.service';

import { CreateCardDto } from './dto/create-card.dto';

// GET fica aberto a qualquer perfil autenticado — Nova Compra (Comprador/
// Estoquista) precisa listar os cartões pra "Compra avulsa". Criar e
// excluir um cartão, porém, é gestão de meio de pagamento e fica restrito
// aos mesmos perfis que acessam Cadastros (mesma tela onde isso é feito).
@Controller('cards')
@UseGuards(JwtAuthGuard)
export class CardsController {
    constructor(private cardsService: CardsService) { }

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async create(@Body() body: CreateCardDto, @CurrentUser() user: any) {
        return this.cardsService.create(body, user);
    }

    @Get()
    async findAll(@CurrentUser() user: any) {
        return this.cardsService.findAll(user);
    }

    @Delete(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.ADMINISTRATIVO, UserRole.PROPRIETARIO, UserRole.GERENTE)
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        return this.cardsService.remove(id, user);
    }

    // Exclusão de verdade — restrita ao dono do sistema (isAdminMaster).
    @Delete(':id/definitivo')
    @UseGuards(AdminMasterGuard)
    async removeDefinitivo(@Param('id') id: string) {
        return this.cardsService.removeDefinitivo(id);
    }
}