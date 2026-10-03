import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminMasterGuard } from '../auth/admin-master.guard';
import { AdminService } from './admin.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';

// Painel do Admin Master (só você, dono do SaaS) — é daqui que nasce uma
// empresa-cliente nova: cria a empresa, cria a(s) loja(s) dela e o primeiro
// usuário (normalmente Proprietário), pra esse cliente virar autônomo a
// partir daí (o resto do time dele é cadastrado pela própria conta, em
// Cadastros → Usuários, igual já funciona hoje).
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminMasterGuard)
export class AdminController {
    constructor(private adminService: AdminService) { }

    @Get('empresas')
    listEmpresas() {
        return this.adminService.listEmpresas();
    }

    @Get('empresas/:id')
    getEmpresa(@Param('id') id: string) {
        return this.adminService.getEmpresa(id);
    }

    @Post('empresas')
    createEmpresa(@Body() body: CreateEmpresaDto) {
        return this.adminService.createEmpresa(body);
    }

    @Patch('empresas/:id')
    updateEmpresa(@Param('id') id: string, @Body() body: UpdateEmpresaDto) {
        return this.adminService.updateEmpresa(id, body);
    }

    @Post('empresas/:id/stores')
    createStore(@Param('id') id: string, @Body() body: CreateStoreDto) {
        return this.adminService.createStore(id, body);
    }

    @Post('empresas/:id/users')
    createUser(@Param('id') id: string, @Body() body: CreateUserDto) {
        return this.adminService.createUser(id, body);
    }
}
