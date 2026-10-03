import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { StoresService } from '../stores/stores.service';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { CreateStoreDto } from '../stores/dto/create-store.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';

// Único lugar do sistema que enxerga TODAS as empresas-cliente ao mesmo
// tempo, de propósito — tudo aqui é gated por AdminMasterGuard no
// controller (só você, dono do SaaS). É daqui que nasce uma empresa nova
// (venda pra outro cliente): cria a empresa, cria a(s) loja(s) dela, e cria
// o primeiro funcionário (normalmente Proprietário) pra esse cliente
// começar a usar o sistema sozinho a partir daí.
@Injectable()
export class AdminService {
    constructor(
        private prisma: PrismaService,
        private usersService: UsersService,
        private storesService: StoresService,
    ) { }

    async listEmpresas() {
        return this.prisma.empresa.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { stores: true, users: true },
                },
            },
        });
    }

    async getEmpresa(id: string) {
        const empresa = await this.prisma.empresa.findUnique({
            where: { id },
            include: {
                stores: {
                    orderBy: { name: 'asc' },
                },
                users: {
                    orderBy: { name: 'asc' },
                    include: {
                        userStores: { include: { store: true } },
                    },
                },
            },
        });

        if (!empresa) {
            throw new NotFoundException('Empresa não encontrada.');
        }

        return empresa;
    }

    async createEmpresa(dto: CreateEmpresaDto) {
        const name = dto.name?.trim();

        if (!name) {
            throw new ConflictException('Informe o nome da empresa.');
        }

        return this.prisma.empresa.create({
            data: {
                name,
                cnpj: dto.cnpj?.trim() || null,
                adminNotes: dto.adminNotes?.trim() || null,
            },
        });
    }

    async updateEmpresa(id: string, dto: UpdateEmpresaDto) {
        await this.getEmpresa(id);

        return this.prisma.empresa.update({
            where: { id },
            data: {
                name: dto.name?.trim(),
                cnpj: dto.cnpj !== undefined ? dto.cnpj?.trim() || null : undefined,
                active: dto.active,
                adminNotes:
                    dto.adminNotes !== undefined
                        ? dto.adminNotes?.trim() || null
                        : undefined,
            },
        });
    }

    // Cria uma loja já vinculada a essa empresa — mesma forma da loja
    // comum (endereço fiscal, CNPJ etc.), só que o dono é escolhido aqui
    // (a empresa-cliente), não a empresa de quem está chamando (porque quem
    // chama é o Admin Master, que não pertence a nenhuma).
    async createStore(empresaId: string, dto: CreateStoreDto) {
        await this.getEmpresa(empresaId);

        return this.storesService.create(dto, empresaId);
    }

    // Cria o primeiro (ou mais um) usuário dessa empresa. Reaproveita todo
    // o fluxo de convite que já existe em UsersService.create (WhatsApp com
    // link de ativação quando não vem senha) — só muda quem é "quem está
    // criando": aqui é sempre o Admin Master agindo em nome da empresa
    // escolhida, então as checagens normais de "só gerencia gente da
    // própria empresa" (ver users.service.ts) são satisfeitas passando
    // isAdminMaster + o empresaId certo pro DTO.
    async createUser(empresaId: string, dto: CreateUserDto) {
        await this.getEmpresa(empresaId);

        return this.usersService.create(
            { ...dto, empresaId },
            { isAdminMaster: true },
        );
    }
}
