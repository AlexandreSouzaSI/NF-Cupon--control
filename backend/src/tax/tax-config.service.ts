import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaxRegimeConfigDto } from './dto/create-tax-regime-config.dto';

// Converte "AAAA-MM" (referenceMonth) num Date no dia 1 ao meio-dia UTC —
// mesmo padrão de meio-dia usado no resto do projeto pra evitar recuo de
// fuso horário.
export function monthToDate(referenceMonth: string): Date {
    const [year, month] = referenceMonth.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
}

// Último dia do mesmo mês, ao meio-dia UTC — usado pra checar vigência.
// Necessário porque uma config cadastrada no meio do mês (ex: dia 17) ainda
// precisa "cobrir" o mês inteiro na hora de calcular, não só o que vem
// depois do dia exato do cadastro.
export function monthEndDate(referenceMonth: string): Date {
    const [year, month] = referenceMonth.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0, 12, 0, 0, 0));
}

@Injectable()
export class TaxConfigService {
    constructor(private prisma: PrismaService) { }

    private getAllowedStoreIds(user: any): string[] | undefined {
        if (
            user.role === UserRole.ADMINISTRATIVO ||
            user.role === UserRole.PROPRIETARIO
        ) {
            return undefined;
        }

        return (
            user.userStores?.map(
                (item: any) => item.storeId || item.store?.id,
            ) || []
        );
    }

    private ensureStoreAccess(storeId: string, user: any) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (!allowedStoreIds) return;

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException('Você não tem acesso a esta loja.');
        }
    }

    // Ao cadastrar uma config nova, fecha automaticamente a vigência da
    // config anterior (se houver e ainda estiver aberta) um dia antes —
    // assim nunca fica mais de uma config "vigente" ao mesmo tempo pra uma
    // loja, o que garante que o cálculo de cada mês sempre bate com uma
    // única configuração.
    async create(dto: CreateTaxRegimeConfigDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        const effectiveFrom = new Date(dto.effectiveFrom);

        const previousOpen = await this.prisma.taxRegimeConfig.findFirst({
            where: { storeId: dto.storeId, effectiveTo: null },
            orderBy: { effectiveFrom: 'desc' },
        });

        return this.prisma.$transaction(async (tx) => {
            if (previousOpen) {
                const dayBefore = new Date(effectiveFrom);
                dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

                await tx.taxRegimeConfig.update({
                    where: { id: previousOpen.id },
                    data: { effectiveTo: dayBefore },
                });
            }

            return tx.taxRegimeConfig.create({
                data: {
                    storeId: dto.storeId,
                    regime: dto.regime,
                    effectiveFrom,
                    simplesAnexo: dto.simplesAnexo,
                    presumidoIrpjPercent: dto.presumidoIrpjPercent,
                    presumidoCsllPercent: dto.presumidoCsllPercent,
                    presumidoPisCofinsPercent: dto.presumidoPisCofinsPercent,
                    realPisCofinsPercent: dto.realPisCofinsPercent,
                    icmsRegimeEspecialMg: dto.icmsRegimeEspecialMg,
                    icmsAliquotaRefeicao: dto.icmsAliquotaRefeicao,
                    icmsAliquotaOutras: dto.icmsAliquotaOutras,
                    icmsAliquotaPadrao: dto.icmsAliquotaPadrao,
                    notes: dto.notes,
                    createdById: user.id,
                },
                include: this.defaultInclude(),
            });
        });
    }

    async findAll(user: any, filters?: { storeId?: string }) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.taxRegimeConfig.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
            },
            orderBy: { effectiveFrom: 'desc' },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        const config = await this.prisma.taxRegimeConfig.findUnique({
            where: { id },
        });

        if (!config) {
            throw new NotFoundException('Configuração não encontrada.');
        }

        this.ensureStoreAccess(config.storeId, user);

        await this.prisma.taxRegimeConfig.delete({ where: { id } });

        return { success: true };
    }

    // Config vigente num mês específico: cobre o mês se o período de
    // vigência (effectiveFrom..effectiveTo) tiver qualquer sobreposição com
    // esse mês — testado comparando effectiveFrom com o ÚLTIMO dia do mês
    // (não o primeiro), senão uma config cadastrada no meio do mês (ex: dia
    // 17) ficaria de fora do próprio mês em que foi criada. É essa função
    // que o motor de cálculo usa — nunca a mais recente cadastrada, pra não
    // recalcular o passado com a regra de hoje.
    async findEffective(storeId: string, referenceMonth: string, user?: any) {
        if (user) {
            this.ensureStoreAccess(storeId, user);
        }

        const monthStart = monthToDate(referenceMonth);
        const monthEnd = monthEndDate(referenceMonth);

        const config = await this.prisma.taxRegimeConfig.findFirst({
            where: {
                storeId,
                effectiveFrom: { lte: monthEnd },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: monthStart } }],
            },
            orderBy: { effectiveFrom: 'desc' },
        });

        return config;
    }

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
        };
    }
}
