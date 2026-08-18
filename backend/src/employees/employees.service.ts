import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    EmployeePaymentStatus,
    EmployeePaymentType,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmployeePaymentDto } from './dto/create-employee-payment.dto';
import { UpdateEmployeePaymentDto } from './dto/update-employee-payment.dto';

const paymentEmployeeSelect = {
    id: true,
    name: true,
    role: true,
    storeId: true,
} as const;

@Injectable()
export class EmployeesService {
    constructor(private prisma: PrismaService) { }

    // Mesma regra usada nos outros serviços: ADMINISTRATIVO/PROPRIETARIO
    // enxergam tudo, os demais só as lojas vinculadas. Como o controller já
    // bloqueia qualquer outro perfil via RolesGuard, na prática só
    // ADMINISTRATIVO/PROPRIETARIO chegam aqui — mantemos o filtro mesmo
    // assim por consistência com o resto do sistema.
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

        if (!allowedStoreIds) {
            return;
        }

        if (!allowedStoreIds.includes(storeId)) {
            throw new ForbiddenException(
                'Você não tem acesso a esta loja.',
            );
        }
    }

    private async ensureEmployeeAccess(id: string, user: any) {
        const employee = await this.prisma.employee.findUnique({
            where: { id },
        });

        if (!employee) {
            throw new NotFoundException('Funcionário não encontrado.');
        }

        this.ensureStoreAccess(employee.storeId, user);

        return employee;
    }

    private async ensurePaymentAccess(id: string, user: any) {
        const payment = await this.prisma.employeePayment.findUnique({
            where: { id },
            include: { employee: true },
        });

        if (!payment) {
            throw new NotFoundException('Pagamento não encontrado.');
        }

        this.ensureStoreAccess(payment.employee.storeId, user);

        return payment;
    }

    // Datas vindas de <input type="date"> chegam sem horário; gravamos com
    // horário intermediário pra não recuar um dia por causa do fuso.
    private toDateWithNoonUtc(value: string) {
        if (value.length <= 10) {
            return new Date(`${value}T12:00:00.000Z`);
        }

        return new Date(value);
    }

    private defaultInclude() {
        return {
            store: true,
            createdBy: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                },
            },
        };
    }

    async create(dto: CreateEmployeeDto, user: any) {
        this.ensureStoreAccess(dto.storeId, user);

        return this.prisma.employee.create({
            data: {
                name: dto.name,
                cpf: dto.cpf,
                role: dto.role,
                phone: dto.phone,
                admissionDate: dto.admissionDate
                    ? this.toDateWithNoonUtc(dto.admissionDate)
                    : undefined,
                active: dto.active ?? true,
                notes: dto.notes,
                salary: dto.salary,
                advanceValue: dto.advanceValue,
                advanceDay: dto.advanceDay,
                paymentValue: dto.paymentValue,
                paymentDay: dto.paymentDay,
                vtValue: dto.vtValue,
                bonusValue: dto.bonusValue,
                bonusDay: dto.bonusDay,
                paymentMethod: dto.paymentMethod,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
                storeId: dto.storeId,
                createdById: user.id,
            },
            include: this.defaultInclude(),
        });
    }

    async findAll(
        user: any,
        filters?: { storeId?: string; name?: string; onlyActive?: boolean },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.employee.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                name: filters?.name
                    ? { contains: filters.name, mode: 'insensitive' }
                    : undefined,
                active: filters?.onlyActive ? true : undefined,
            },
            orderBy: { name: 'asc' },
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        await this.ensureEmployeeAccess(id, user);

        return this.prisma.employee.findUnique({
            where: { id },
            include: this.defaultInclude(),
        });
    }

    async update(id: string, dto: UpdateEmployeeDto, user: any) {
        await this.ensureEmployeeAccess(id, user);

        if (dto.storeId) {
            this.ensureStoreAccess(dto.storeId, user);
        }

        return this.prisma.employee.update({
            where: { id },
            data: {
                name: dto.name,
                cpf: dto.cpf,
                role: dto.role,
                phone: dto.phone,
                admissionDate: dto.admissionDate
                    ? this.toDateWithNoonUtc(dto.admissionDate)
                    : undefined,
                active: dto.active,
                notes: dto.notes,
                salary: dto.salary,
                advanceValue: dto.advanceValue,
                advanceDay: dto.advanceDay,
                paymentValue: dto.paymentValue,
                paymentDay: dto.paymentDay,
                vtValue: dto.vtValue,
                bonusValue: dto.bonusValue,
                bonusDay: dto.bonusDay,
                paymentMethod: dto.paymentMethod,
                pixKey: dto.pixKey,
                pixKeyType: dto.pixKeyType,
                storeId: dto.storeId,
            },
            include: this.defaultInclude(),
        });
    }

    // Segue o padrão de Cartões/Fornecedores: não apaga o histórico de
    // pagamentos, só marca como inativo.
    async remove(id: string, user: any) {
        await this.ensureEmployeeAccess(id, user);

        return this.prisma.employee.update({
            where: { id },
            data: { active: false },
        });
    }

    private lastDayOfMonth(year: number, month: number) {
        return new Date(year, month + 1, 0).getDate();
    }

    private formatBrDate(date: Date) {
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    private formatBrCurrency(value: number) {
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }

    // Monta os lançamentos recorrentes de um funcionário pra um mês
    // específico (adiantamento/pagamento/premiação — um por mês). Não grava
    // nada; quem persiste é generateLaunches.
    //
    // O vale-transporte não vira mais um lançamento por dia: o valor do
    // período é somado e embutido no próprio lançamento de Pagamento,
    // porque é pago junto (adiantado) — o período de um Pagamento no dia D
    // cobre do dia D+1 até o dia D do mês seguinte.
    private buildMonthlyLaunches(
        employee: {
            id: string;
            admissionDate: Date | null;
            advanceValue: any;
            advanceDay: number | null;
            paymentValue: any;
            paymentDay: number | null;
            vtValue: any;
            bonusValue: any;
            bonusDay: number | null;
        },
        year: number,
        month: number, // 0-indexed
    ) {
        const referenceMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
        const lastDay = this.lastDayOfMonth(year, month);
        const records: {
            employeeId: string;
            type: EmployeePaymentType;
            value: number;
            dueDate: Date;
            referenceMonth: string;
            status: EmployeePaymentStatus;
            notes?: string;
        }[] = [];

        if (employee.advanceValue && employee.advanceDay) {
            const day = Math.min(employee.advanceDay, lastDay);

            records.push({
                employeeId: employee.id,
                type: EmployeePaymentType.ADIANTAMENTO,
                value: Number(employee.advanceValue),
                dueDate: new Date(Date.UTC(year, month, day, 12, 0, 0, 0)),
                referenceMonth,
                status: EmployeePaymentStatus.OPEN,
            });
        }

        if (employee.bonusValue && employee.bonusDay) {
            const day = Math.min(employee.bonusDay, lastDay);

            records.push({
                employeeId: employee.id,
                type: EmployeePaymentType.PREMIACAO,
                value: Number(employee.bonusValue),
                dueDate: new Date(Date.UTC(year, month, day, 12, 0, 0, 0)),
                referenceMonth,
                status: EmployeePaymentStatus.OPEN,
            });
        }

        // Pagamento (+ vale-transporte do período, se configurado). Sem
        // paymentDay não dá pra definir o período do VT, então nesse caso o
        // VT simplesmente não é lançado automaticamente.
        if (employee.paymentDay) {
            const day = Math.min(employee.paymentDay, lastDay);
            const dueDate = new Date(
                Date.UTC(year, month, day, 12, 0, 0, 0),
            );

            let value = employee.paymentValue
                ? Number(employee.paymentValue)
                : 0;
            let notes: string | undefined;

            if (employee.vtValue && Number(employee.vtValue) > 0) {
                const periodStart = new Date(dueDate);
                periodStart.setUTCDate(periodStart.getUTCDate() + 1);

                const nextMonth = month === 11 ? 0 : month + 1;
                const nextYear = month === 11 ? year + 1 : year;
                const nextLastDay = this.lastDayOfMonth(
                    nextYear,
                    nextMonth,
                );
                const nextDay = Math.min(
                    employee.paymentDay,
                    nextLastDay,
                );
                const periodEnd = new Date(
                    Date.UTC(nextYear, nextMonth, nextDay, 12, 0, 0, 0),
                );

                const daysInPeriod =
                    Math.round(
                        (periodEnd.getTime() - periodStart.getTime()) /
                        (1000 * 60 * 60 * 24),
                    ) + 1;

                if (daysInPeriod > 0) {
                    const vtDaily = Number(employee.vtValue) * 2;
                    const vtTotal = daysInPeriod * vtDaily;

                    value += vtTotal;

                    notes = `Inclui vale transporte de ${this.formatBrDate(periodStart)} a ${this.formatBrDate(periodEnd)} (${daysInPeriod} dia(s) x ${this.formatBrCurrency(vtDaily)} = ${this.formatBrCurrency(vtTotal)})`;
                }
            }

            if (value > 0) {
                records.push({
                    employeeId: employee.id,
                    type: EmployeePaymentType.PAGAMENTO,
                    value,
                    dueDate,
                    referenceMonth,
                    status: EmployeePaymentStatus.OPEN,
                    notes,
                });
            }
        }

        return records;
    }

    // Gera os lançamentos do mês atual e do próximo pros funcionários
    // ativos no escopo do usuário — mesma lógica que os boletos de Contas a
    // Pagar teriam se fossem recorrentes. Idempotente: chamar de novo não
    // duplica nada, e atualiza o valor de lançamentos que ainda estão
    // abertos e nunca foram tocados manualmente (ex.: o valor do VT mudou
    // no cadastro do funcionário depois do lançamento já ter sido gerado).
    async generateLaunches(user: any, filters?: { storeId?: string }) {
        const employees = await this.findAll(user, {
            storeId: filters?.storeId,
            onlyActive: true,
        });

        if (employees.length === 0) {
            return { created: 0, updated: 0, removed: 0 };
        }

        const employeeIds = employees.map((employee) => employee.id);

        // O vale-transporte deixou de ser lançado dia a dia (passou a ser
        // somado ao Pagamento) — limpa os lançamentos diários antigos que
        // ainda estejam em aberto e tenham sido gerados pelo sistema, sem
        // mexer em nada que já foi pago ou lançado manualmente.
        const removedResult = await this.prisma.employeePayment.deleteMany({
            where: {
                employeeId: { in: employeeIds },
                type: EmployeePaymentType.VALE_TRANSPORTE,
                status: EmployeePaymentStatus.OPEN,
                createdById: null,
            },
        });

        const now = new Date();
        const months = [
            { year: now.getFullYear(), month: now.getMonth() },
            {
                year:
                    now.getMonth() === 11
                        ? now.getFullYear() + 1
                        : now.getFullYear(),
                month: (now.getMonth() + 1) % 12,
            },
        ];

        const records = employees.flatMap((employee) =>
            months.flatMap(({ year, month }) =>
                this.buildMonthlyLaunches(employee as any, year, month),
            ),
        );

        let created = 0;
        let updated = 0;

        for (const record of records) {
            const existing = await this.prisma.employeePayment.findUnique({
                where: {
                    employeeId_type_dueDate: {
                        employeeId: record.employeeId,
                        type: record.type,
                        dueDate: record.dueDate,
                    },
                },
            });

            if (!existing) {
                await this.prisma.employeePayment.create({
                    data: record,
                });

                created += 1;
                continue;
            }

            const canAutoUpdate =
                existing.status === EmployeePaymentStatus.OPEN &&
                existing.createdById === null;

            if (canAutoUpdate && Number(existing.value) !== record.value) {
                await this.prisma.employeePayment.update({
                    where: { id: existing.id },
                    data: {
                        value: record.value,
                        notes: record.notes,
                    },
                });

                updated += 1;
            }
        }

        return { created, updated, removed: removedResult.count };
    }

    async findPayments(
        user: any,
        filters?: {
            storeId?: string;
            status?: string;
            type?: string;
            employeeId?: string;
        },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.employeePayment.findMany({
            where: {
                employeeId: filters?.employeeId,
                employee: {
                    storeId:
                        filters?.storeId ||
                        (allowedStoreIds
                            ? { in: allowedStoreIds }
                            : undefined),
                },
                status: filters?.status
                    ? (filters.status as EmployeePaymentStatus)
                    : undefined,
                type: filters?.type
                    ? (filters.type as EmployeePaymentType)
                    : undefined,
            },
            orderBy: { dueDate: 'asc' },
            include: {
                employee: { select: paymentEmployeeSelect },
            },
        });
    }

    // Lançamentos avulsos (13º, férias, rescisão, outro) — os recorrentes
    // são sempre gerados via generateLaunches.
    async createManualPayment(
        dto: CreateEmployeePaymentDto,
        user: any,
        receiptFileUrl: string | undefined,
    ) {
        const employee = await this.ensureEmployeeAccess(
            dto.employeeId,
            user,
        );

        return this.prisma.employeePayment.create({
            data: {
                employeeId: employee.id,
                type: dto.type,
                value: dto.value,
                dueDate: this.toDateWithNoonUtc(dto.dueDate),
                referenceMonth: dto.referenceMonth,
                notes: dto.notes,
                receiptFileUrl,
                createdById: user.id,
            },
            include: {
                employee: { select: paymentEmployeeSelect },
            },
        });
    }

    async updatePayment(
        id: string,
        dto: UpdateEmployeePaymentDto,
        user: any,
    ) {
        await this.ensurePaymentAccess(id, user);

        return this.prisma.employeePayment.update({
            where: { id },
            data: {
                value: dto.value,
                dueDate: dto.dueDate
                    ? this.toDateWithNoonUtc(dto.dueDate)
                    : undefined,
                referenceMonth: dto.referenceMonth,
                notes: dto.notes,
            },
            include: {
                employee: { select: paymentEmployeeSelect },
            },
        });
    }

    async markPaid(
        id: string,
        user: any,
        receiptFileUrl: string | undefined,
    ) {
        await this.ensurePaymentAccess(id, user);

        return this.prisma.employeePayment.update({
            where: { id },
            data: {
                status: EmployeePaymentStatus.PAID,
                paidAt: new Date(),
                receiptFileUrl: receiptFileUrl || undefined,
            },
            include: {
                employee: { select: paymentEmployeeSelect },
            },
        });
    }

    async reopenPayment(id: string, user: any) {
        await this.ensurePaymentAccess(id, user);

        return this.prisma.employeePayment.update({
            where: { id },
            data: {
                status: EmployeePaymentStatus.OPEN,
                paidAt: null,
            },
            include: {
                employee: { select: paymentEmployeeSelect },
            },
        });
    }

    async removePayment(id: string, user: any) {
        await this.ensurePaymentAccess(id, user);

        return this.prisma.employeePayment.delete({
            where: { id },
        });
    }
}
