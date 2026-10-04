import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { MODULE_LABELS } from '../common/store-module-labels';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

// CRUD dos planos vendidos pelo SaaS. Quem edita é só o Admin Master (o
// controller aplica AdminMasterGuard); a listagem pública só devolve planos
// ativos. Plano nunca é apagado (assinaturas apontam pra ele) — desativa.
@Injectable()
export class PlansService {
    constructor(private prisma: PrismaService) { }

    // Vitrine pública (/planos e landing): só ativos, do mais barato pro
    // mais caro dentro da mesma ordem manual.
    async listPublic() {
        const plans = await this.prisma.plan.findMany({
            where: { active: true },
            orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
        });

        return {
            plans,
            // Rótulos amigáveis dos módulos pra tela não duplicar o texto.
            moduleLabels: MODULE_LABELS,
        };
    }

    listAll() {
        return this.prisma.plan.findMany({
            orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }],
            include: { _count: { select: { subscriptions: true } } },
        });
    }

    create(dto: CreatePlanDto) {
        return this.prisma.plan.create({
            data: {
                name: dto.name.trim(),
                description: dto.description?.trim() || null,
                priceCents: dto.priceCents,
                modules: Array.from(new Set(dto.modules)),
                active: dto.active ?? true,
                sortOrder: dto.sortOrder ?? 0,
            },
        });
    }

    // Mudar preço/módulos NÃO mexe nas assinaturas já criadas no Asaas (o
    // valor delas continua o contratado); vale pras próximas assinaturas.
    // Os módulos novos chegam às empresas na próxima ativação/renovação.
    async update(id: string, dto: UpdatePlanDto) {
        const existing = await this.prisma.plan.findUnique({ where: { id } });

        if (!existing) {
            throw new NotFoundException('Plano não encontrado.');
        }

        return this.prisma.plan.update({
            where: { id },
            data: {
                name: dto.name?.trim(),
                description:
                    dto.description !== undefined
                        ? dto.description.trim() || null
                        : undefined,
                priceCents: dto.priceCents,
                modules: dto.modules
                    ? Array.from(new Set(dto.modules))
                    : undefined,
                active: dto.active,
                sortOrder: dto.sortOrder,
            },
        });
    }
}
