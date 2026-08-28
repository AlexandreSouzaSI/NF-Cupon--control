import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLossDto } from './dto/create-loss.dto';

// Além de quem registrou, só gestão pode apagar um registro (ex: foto
// errada, duplicado).
const MANAGE_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
];

// Quem recebe o aviso de nova perda registrada — Administrativo e
// Proprietário sempre entram automaticamente (acesso global, ver
// notifyStoreAccess), então só precisa listar Gerente aqui.
const LOSS_NOTIFY_ROLES: UserRole[] = [UserRole.GERENTE];

@Injectable()
export class LossesService {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

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

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            reportedBy: { select: { id: true, name: true } },
        };
    }

    async create(dto: CreateLossDto, photoUrl: string | undefined, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        if (!photoUrl) {
            throw new BadRequestException(
                'A foto do que foi perdido é obrigatória.',
            );
        }

        const loss = await this.prisma.productLoss.create({
            data: {
                storeId: dto.storeId,
                description: dto.description,
                quantity: dto.quantity,
                unit: dto.unit,
                reason: dto.reason,
                photoUrl,
                occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
                reportedById: user.id,
            },
            include: this.defaultInclude(),
        });

        await this.notificationsService.notifyStoreAccess({
            storeId: loss.storeId,
            allowedRoles: LOSS_NOTIFY_ROLES,
            excludeUserId: user.id,
            title: 'Nova perda registrada',
            message: `${loss.reportedBy.name} registrou perda de "${loss.description}" (${Number(loss.quantity)}${loss.unit ? ` ${loss.unit}` : ''}) em ${loss.store.name}.`,
            type: NotificationType.LOSS_ADDED,
        });

        return loss;
    }

    async findAll(
        user: any,
        filters: { storeId?: string; month?: number; year?: number },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        const range = this.monthRange(filters.month, filters.year);

        return this.prisma.productLoss.findMany({
            where: {
                storeId:
                    filters.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                occurredAt: range,
            },
            orderBy: { occurredAt: 'desc' },
            include: this.defaultInclude(),
        });
    }

    // Intervalo do mês (1º dia 00:00 até 1º dia do mês seguinte) — só
    // aplica o filtro se vier mês e ano; senão volta tudo.
    private monthRange(month?: number, year?: number) {
        if (!month || !year) return undefined;

        const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));

        return { gte: start, lt: end };
    }

    // Base do relatório mensal (aba Relatório): mesma lista de findAll,
    // mas já soma quantidade por descrição pra facilitar montar a NF de
    // perda no final do mês.
    async monthlyReport(
        user: any,
        filters: { storeId: string; month: number; year: number },
    ) {
        this.ensureStoreAccess(filters.storeId, user);

        const range = this.monthRange(filters.month, filters.year);

        const losses = await this.prisma.productLoss.findMany({
            where: { storeId: filters.storeId, occurredAt: range },
            orderBy: { occurredAt: 'desc' },
            include: this.defaultInclude(),
        });

        const totalsByDescription = new Map<
            string,
            { description: string; unit: string | null; quantity: number }
        >();

        for (const loss of losses) {
            const key = `${loss.description.trim().toLowerCase()}__${loss.unit || ''}`;
            const existing = totalsByDescription.get(key);

            if (existing) {
                existing.quantity += Number(loss.quantity);
            } else {
                totalsByDescription.set(key, {
                    description: loss.description,
                    unit: loss.unit,
                    quantity: Number(loss.quantity),
                });
            }
        }

        return {
            losses,
            totals: Array.from(totalsByDescription.values()).sort((a, b) =>
                a.description.localeCompare(b.description),
            ),
        };
    }

    async remove(id: string, user: any) {
        const loss = await this.prisma.productLoss.findUnique({
            where: { id },
        });

        if (!loss) {
            throw new NotFoundException('Registro de perda não encontrado.');
        }

        this.ensureStoreAccess(loss.storeId, user);

        if (loss.reportedById !== user.id && !MANAGE_ROLES.includes(user.role)) {
            throw new ForbiddenException(
                'Só quem registrou ou a gestão pode apagar esse registro.',
            );
        }

        await this.prisma.productLoss.delete({ where: { id } });

        return { success: true };
    }
}
