import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { FreelancerPaymentGroup, UserRole } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateFreelancerDto } from './dto/create-freelancer.dto';
import { UpdateFreelancerDto } from './dto/update-freelancer.dto';
import { SetWorkDaysDto } from './dto/set-work-days.dto';
import { ConfirmFreelancerPaymentDto } from './dto/confirm-payment.dto';

// Dias da semana (JS getUTCDay: 0=domingo ... 6=sábado) que entram em cada
// grupo de pagamento. Segunda (1) nunca aparece — não é dia de trabalho
// rastreado aqui, é só o dia em que o grupo de sexta/sábado/domingo é pago.
const SEXTA_GROUP_WEEKDAYS = [2, 3, 4]; // terça, quarta, quinta
const SEGUNDA_GROUP_WEEKDAYS = [5, 6, 0]; // sexta, sábado, domingo

@Injectable()
export class FreelancersService {
    constructor(private prisma: PrismaService) { }

    // Mesmo padrão usado em todo o resto do sistema: Administrativo/
    // Proprietário enxergam todas as lojas, os demais só as vinculadas.
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

    private async ensureFreelancerAccess(id: string, user: any) {
        const freelancer = await this.prisma.freelancer.findUnique({
            where: { id },
        });

        if (!freelancer) {
            throw new NotFoundException('Freelancer não encontrado.');
        }

        this.ensureStoreAccess(freelancer.storeId, user);

        return freelancer;
    }

    // "AAAA-MM-DD" vindo do <input type="date"> do front — grava com
    // horário intermediário (meio-dia UTC), mesmo padrão do resto do
    // projeto, pra nunca recuar um dia por causa do fuso.
    private toDateNoonUtc(value: string): Date {
        if (value.length <= 10) {
            return new Date(`${value}T12:00:00.000Z`);
        }

        return new Date(value);
    }

    private addDaysUtc(date: Date, days: number): Date {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
        };
    }

    async create(dto: CreateFreelancerDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        return this.prisma.freelancer.create({
            data: {
                name: dto.name,
                storeId: dto.storeId,
                defaultDailyValue: dto.defaultDailyValue,
                active: dto.active ?? true,
                createdById: user.id,
            },
            include: this.defaultInclude(),
        });
    }

    async findAll(
        user: any,
        filters?: { storeId?: string; onlyActive?: boolean },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.freelancer.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                active: filters?.onlyActive ? true : undefined,
            },
            orderBy: { name: 'asc' },
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        const freelancer = await this.ensureFreelancerAccess(id, user);

        return this.prisma.freelancer.findUnique({
            where: { id: freelancer.id },
            include: this.defaultInclude(),
        });
    }

    async update(id: string, dto: UpdateFreelancerDto, user: any) {
        await this.ensureFreelancerAccess(id, user);

        if (dto.storeId) {
            this.ensureStoreAccess(dto.storeId, user);
        }

        return this.prisma.freelancer.update({
            where: { id },
            data: {
                name: dto.name,
                storeId: dto.storeId,
                defaultDailyValue: dto.defaultDailyValue,
                active: dto.active,
            },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        await this.ensureFreelancerAccess(id, user);

        return this.prisma.freelancer.update({
            where: { id },
            data: { active: false },
        });
    }

    // Substitui, de uma vez, os dias marcados daquele freelancer pra
    // semana (Terça a Domingo) informada — apaga o que não veio na lista e
    // grava o que veio, sempre dentro da mesma transação.
    async setWorkDays(freelancerId: string, dto: SetWorkDaysDto, user: any) {
        await this.ensureFreelancerAccess(freelancerId, user);

        const weekStart = this.toDateNoonUtc(dto.weekStart);
        const weekEnd = this.addDaysUtc(weekStart, 5);

        for (const day of dto.days) {
            const date = this.toDateNoonUtc(day.date);

            if (date < weekStart || date > weekEnd) {
                throw new BadRequestException(
                    'Um dos dias enviados está fora da semana selecionada.',
                );
            }
        }

        return this.prisma.$transaction(async (tx) => {
            await tx.freelancerWorkDay.deleteMany({
                where: {
                    freelancerId,
                    date: { gte: weekStart, lte: weekEnd },
                },
            });

            if (dto.days.length > 0) {
                await tx.freelancerWorkDay.createMany({
                    data: dto.days.map((day) => ({
                        freelancerId,
                        date: this.toDateNoonUtc(day.date),
                        value: day.value,
                    })),
                });
            }

            return tx.freelancerWorkDay.findMany({
                where: {
                    freelancerId,
                    date: { gte: weekStart, lte: weekEnd },
                },
                orderBy: { date: 'asc' },
            });
        });
    }

    async findWorkDays(freelancerId: string, weekStart: string, user: any) {
        await this.ensureFreelancerAccess(freelancerId, user);

        const start = this.toDateNoonUtc(weekStart);
        const end = this.addDaysUtc(start, 5);

        return this.prisma.freelancerWorkDay.findMany({
            where: {
                freelancerId,
                date: { gte: start, lte: end },
            },
            orderBy: { date: 'asc' },
        });
    }

    // Dado o início da semana (terça) e o grupo, devolve o intervalo de
    // dias trabalhados que entram nele e a data em que é pago. Mesma regra
    // em todo o sistema: terça-quinta paga na sexta da mesma semana;
    // sexta-domingo paga na segunda seguinte (semana que vem).
    private getGroupRange(weekStart: Date, group: FreelancerPaymentGroup) {
        if (group === FreelancerPaymentGroup.SEXTA) {
            return {
                rangeStart: weekStart,
                rangeEnd: this.addDaysUtc(weekStart, 2), // quinta
                paymentDate: this.addDaysUtc(weekStart, 3), // sexta
            };
        }

        return {
            rangeStart: this.addDaysUtc(weekStart, 3), // sexta
            rangeEnd: this.addDaysUtc(weekStart, 5), // domingo
            paymentDate: this.addDaysUtc(weekStart, 6), // segunda seguinte
        };
    }

    // Monta o quadro de pagamentos da semana: pra cada freelancer ativo da
    // loja, separa os dias trabalhados nos dois grupos (terça-quinta ->
    // paga sexta; sexta-domingo -> paga a segunda seguinte) e soma os
    // valores, usando o valor do dia quando informado ou caindo pro valor
    // padrão do cadastro. Também informa se cada grupo já teve o
    // pagamento confirmado (FreelancerPayment), pra tela decidir entre
    // mostrar "Marcar como pago" ou o selo de confirmado.
    async getPaymentsSummary(storeId: string, weekStart: string, user: any) {
        this.ensureStoreAccess(storeId, user);

        const start = this.toDateNoonUtc(weekStart);
        const end = this.addDaysUtc(start, 5);
        const fridayDate = this.addDaysUtc(start, 3);
        const mondayDate = this.addDaysUtc(start, 6);

        const freelancers = await this.prisma.freelancer.findMany({
            where: { storeId, active: true },
            orderBy: { name: 'asc' },
            include: {
                workDays: {
                    where: { date: { gte: start, lte: end } },
                    orderBy: { date: 'asc' },
                },
                payments: {
                    where: {
                        paymentDate: { in: [fridayDate, mondayDate] },
                    },
                },
            },
        });

        const result = freelancers.map((freelancer) => {
            const defaultValue = Number(freelancer.defaultDailyValue);

            const days = freelancer.workDays.map((workDay) => ({
                date: workDay.date,
                weekday: workDay.date.getUTCDay(),
                value:
                    workDay.value !== null
                        ? Number(workDay.value)
                        : defaultValue,
                isCustomValue: workDay.value !== null,
            }));

            const sextaTotal = days
                .filter((d) => SEXTA_GROUP_WEEKDAYS.includes(d.weekday))
                .reduce((sum, d) => sum + d.value, 0);

            const segundaTotal = days
                .filter((d) => SEGUNDA_GROUP_WEEKDAYS.includes(d.weekday))
                .reduce((sum, d) => sum + d.value, 0);

            const sextaPayment = freelancer.payments.find(
                (p) =>
                    p.group === FreelancerPaymentGroup.SEXTA &&
                    p.paymentDate.getTime() === fridayDate.getTime(),
            );

            const segundaPayment = freelancer.payments.find(
                (p) =>
                    p.group === FreelancerPaymentGroup.SEGUNDA &&
                    p.paymentDate.getTime() === mondayDate.getTime(),
            );

            return {
                id: freelancer.id,
                name: freelancer.name,
                defaultDailyValue: defaultValue,
                days,
                sextaTotal,
                segundaTotal,
                sextaConfirmed: !!sextaPayment,
                sextaPaymentId: sextaPayment?.id ?? null,
                segundaConfirmed: !!segundaPayment,
                segundaPaymentId: segundaPayment?.id ?? null,
            };
        });

        return {
            weekStart: start,
            weekEnd: end,
            freelancers: result,
            totalSexta: result.reduce((sum, f) => sum + f.sextaTotal, 0),
            totalSegunda: result.reduce((sum, f) => sum + f.segundaTotal, 0),
        };
    }

    // Congela em FreelancerPayment o que foi de fato pago naquele grupo —
    // depois de confirmado, editar os dias trabalhados daquela semana não
    // muda mais esse valor (é isso que alimenta o relatório). Reconfirmar
    // (upsert) só recalcula se ainda não tiver saído o dinheiro de
    // verdade — a tela deixa isso claro pro usuário.
    async confirmPayment(
        freelancerId: string,
        dto: ConfirmFreelancerPaymentDto,
        user: any,
    ) {
        const freelancer = await this.ensureFreelancerAccess(
            freelancerId,
            user,
        );

        const weekStart = this.toDateNoonUtc(dto.weekStart);
        const { rangeStart, rangeEnd, paymentDate } = this.getGroupRange(
            weekStart,
            dto.group,
        );

        const workDays = await this.prisma.freelancerWorkDay.findMany({
            where: {
                freelancerId,
                date: { gte: rangeStart, lte: rangeEnd },
            },
            orderBy: { date: 'asc' },
        });

        if (workDays.length === 0) {
            throw new BadRequestException(
                'Nenhum dia trabalhado nesse grupo pra confirmar pagamento.',
            );
        }

        const defaultValue = Number(freelancer.defaultDailyValue);

        const snapshot = workDays.map((workDay) => ({
            date: workDay.date.toISOString(),
            value:
                workDay.value !== null
                    ? Number(workDay.value)
                    : defaultValue,
        }));

        const totalValue = snapshot.reduce((sum, d) => sum + d.value, 0);

        return this.prisma.freelancerPayment.upsert({
            where: {
                freelancerId_group_paymentDate: {
                    freelancerId,
                    group: dto.group,
                    paymentDate,
                },
            },
            update: {
                totalValue,
                workDaysSnapshot: snapshot,
                paidAt: new Date(),
                createdById: user.id,
            },
            create: {
                freelancerId,
                storeId: freelancer.storeId,
                group: dto.group,
                paymentDate,
                totalValue,
                workDaysSnapshot: snapshot,
                createdById: user.id,
            },
        });
    }

    // Desfaz uma confirmação (ex: foi marcado por engano) — some do
    // relatório e a tela de Pagamentos volta a oferecer "Marcar como
    // pago" pra aquele grupo.
    async removePaymentConfirmation(paymentId: string, user: any) {
        const payment = await this.prisma.freelancerPayment.findUnique({
            where: { id: paymentId },
        });

        if (!payment) {
            throw new NotFoundException('Pagamento não encontrado.');
        }

        this.ensureStoreAccess(payment.storeId, user);

        await this.prisma.freelancerPayment.delete({
            where: { id: paymentId },
        });

        return { success: true };
    }

    // Base do relatório — a tela decide se agrupa por dia pago ou por
    // freelancer usando o mesmo resultado, filtrando localmente.
    async findPaymentsReport(
        user: any,
        filters: {
            storeId?: string;
            freelancerId?: string;
            from?: string;
            to?: string;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.freelancerPayment.findMany({
            where: {
                storeId:
                    filters.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                freelancerId: filters.freelancerId || undefined,
                paymentDate: {
                    gte: filters.from
                        ? this.toDateNoonUtc(filters.from)
                        : undefined,
                    lte: filters.to
                        ? this.toDateNoonUtc(filters.to)
                        : undefined,
                },
            },
            orderBy: { paymentDate: 'desc' },
            include: {
                freelancer: { select: { id: true, name: true } },
            },
        });
    }
}
