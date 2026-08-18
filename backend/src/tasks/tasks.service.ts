import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    NotificationType,
    Task,
    TaskOccurrenceStatus,
    TaskRecurrence,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

// Quem pode criar/editar/remover tarefas e desfazer confirmações — a
// própria tela é aberta pra todo mundo ver, mas só gestão pode atribuir.
const MANAGE_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
    UserRole.GERENTE,
];

// Só esses dois perfis enxergam todas as tarefas da loja. Todo o resto
// (inclusive Gerente) só vê a tarefa se foi ele quem criou ou se foi
// atribuída a ele — sem tarefa nenhuma vinculada, não vê tarefa de
// ninguém.
const GLOBAL_VIEW_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
];

// Precisa do nome do responsável pra montar a mensagem de notificação de
// quem criou a tarefa ("atribuída a Fulano").
type TaskWithAssignee = Task & { assignedTo: { name: string } };

@Injectable()
export class TasksService implements OnModuleInit {
    constructor(
        private prisma: PrismaService,
        private notificationsService: NotificationsService,
    ) { }

    // Roda uma vez quando o backend sobe — assim, toda vez que reiniciar
    // (ex: depois de um deploy), já gera na hora qualquer ocorrência que
    // esteja faltando, sem precisar esperar o cron das 6h.
    async onModuleInit() {
        await this.runDailyGeneration();
    }

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

    private ensureCanManage(user: any) {
        if (!MANAGE_ROLES.includes(user.role)) {
            throw new ForbiddenException(
                'Só Administrativo, Proprietário e Gerente podem gerenciar tarefas.',
            );
        }
    }

    // Fora de Administrativo/Proprietário (que veem tudo), só quem criou
    // a tarefa ou é o responsável por fazê-la pode vê-la/gerenciá-la.
    private ensureTaskVisible(
        task: { createdById: string; assignedToId: string },
        user: any,
    ) {
        if (GLOBAL_VIEW_ROLES.includes(user.role)) return;

        if (task.createdById === user.id || task.assignedToId === user.id) {
            return;
        }

        throw new ForbiddenException('Você não tem acesso a essa tarefa.');
    }

    // "AAAA-MM-DD" vindo do <input type="date"> — grava com horário
    // intermediário (meio-dia UTC), mesmo padrão do resto do projeto, pra
    // nunca recuar um dia por causa do fuso.
    private toDateNoonUtc(value: string): Date {
        if (value.length <= 10) {
            return new Date(`${value}T12:00:00.000Z`);
        }

        return new Date(value);
    }

    private startOfUtcDay(date: Date): Date {
        return new Date(
            Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
        );
    }

    private addDaysUtc(date: Date, days: number): Date {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() + days);
        return result;
    }

    private lastDayOfMonthUtc(year: number, monthIndex: number): number {
        // dia 0 do mês seguinte = último dia do mês atual
        return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    }

    private defaultInclude() {
        return {
            store: { select: { id: true, name: true } },
            assignedTo: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
        };
    }

    private validateRecurrenceFields(dto: {
        recurrence: TaskRecurrence;
        weekday?: number;
        dayOfMonth?: number;
        dueDate?: string;
    }) {
        if (dto.recurrence === TaskRecurrence.WEEKLY && dto.weekday === undefined) {
            throw new BadRequestException(
                'Informe o dia da semana pra uma tarefa semanal.',
            );
        }

        if (
            dto.recurrence === TaskRecurrence.MONTHLY &&
            dto.dayOfMonth === undefined
        ) {
            throw new BadRequestException(
                'Informe o dia do mês pra uma tarefa mensal.',
            );
        }

        if (dto.recurrence === TaskRecurrence.ONCE && !dto.dueDate) {
            throw new BadRequestException(
                'Informe a data pra uma tarefa ocasional.',
            );
        }
    }

    async create(dto: CreateTaskDto, user: any) {
        this.ensureCanManage(user);
        this.ensureStoreAccess(dto.storeId, user);
        this.validateRecurrenceFields(dto);

        const assignee = await this.prisma.user.findUnique({
            where: { id: dto.assignedToId },
        });

        if (!assignee || !assignee.active) {
            throw new BadRequestException('Responsável inválido.');
        }

        const task = await this.prisma.task.create({
            data: {
                title: dto.title,
                description: dto.description,
                storeId: dto.storeId,
                assignedToId: dto.assignedToId,
                createdById: user.id,
                recurrence: dto.recurrence,
                weekday: dto.recurrence === TaskRecurrence.WEEKLY ? dto.weekday : null,
                dayOfMonth:
                    dto.recurrence === TaskRecurrence.MONTHLY ? dto.dayOfMonth : null,
                dueDate:
                    dto.recurrence === TaskRecurrence.ONCE && dto.dueDate
                        ? this.toDateNoonUtc(dto.dueDate)
                        : null,
            },
            include: this.defaultInclude(),
        });

        // Gera de imediato a primeira ocorrência aplicável (hoje ou a
        // próxima data que bater com a regra, ou a data fixa no caso de
        // tarefa ocasional) e já avisa o responsável — não precisa esperar
        // o cron do dia seguinte.
        await this.ensureNextOccurrence(task, new Date());

        return task;
    }

    async findAll(
        user: any,
        filters?: { storeId?: string; assignedToId?: string; active?: boolean },
    ) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (filters?.storeId) {
            this.ensureStoreAccess(filters.storeId, user);
        }

        return this.prisma.task.findMany({
            where: {
                storeId:
                    filters?.storeId ||
                    (allowedStoreIds ? { in: allowedStoreIds } : undefined),
                assignedToId: filters?.assignedToId,
                active: filters?.active,
                ...(GLOBAL_VIEW_ROLES.includes(user.role)
                    ? {}
                    : { OR: [{ createdById: user.id }, { assignedToId: user.id }] }),
            },
            orderBy: { createdAt: 'desc' },
            include: this.defaultInclude(),
        });
    }

    async findOne(id: string, user: any) {
        const task = await this.prisma.task.findUnique({
            where: { id },
            include: this.defaultInclude(),
        });

        if (!task) {
            throw new NotFoundException('Tarefa não encontrada.');
        }

        this.ensureStoreAccess(task.storeId, user);
        this.ensureTaskVisible(task, user);

        return task;
    }

    async update(id: string, dto: UpdateTaskDto, user: any) {
        this.ensureCanManage(user);

        const task = await this.prisma.task.findUnique({ where: { id } });

        if (!task) {
            throw new NotFoundException('Tarefa não encontrada.');
        }

        this.ensureStoreAccess(task.storeId, user);
        this.ensureTaskVisible(task, user);

        if (dto.storeId) {
            this.ensureStoreAccess(dto.storeId, user);
        }

        const recurrence = dto.recurrence || task.recurrence;

        if (dto.recurrence) {
            this.validateRecurrenceFields({
                recurrence: dto.recurrence,
                weekday: dto.weekday,
                dayOfMonth: dto.dayOfMonth,
                dueDate: dto.dueDate,
            });
        }

        return this.prisma.task.update({
            where: { id },
            data: {
                title: dto.title,
                description: dto.description,
                storeId: dto.storeId,
                assignedToId: dto.assignedToId,
                recurrence: dto.recurrence,
                weekday:
                    recurrence === TaskRecurrence.WEEKLY
                        ? dto.weekday ?? task.weekday
                        : recurrence !== task.recurrence
                            ? null
                            : undefined,
                dayOfMonth:
                    recurrence === TaskRecurrence.MONTHLY
                        ? dto.dayOfMonth ?? task.dayOfMonth
                        : recurrence !== task.recurrence
                            ? null
                            : undefined,
                dueDate:
                    recurrence === TaskRecurrence.ONCE && dto.dueDate
                        ? this.toDateNoonUtc(dto.dueDate)
                        : undefined,
                active: dto.active,
            },
            include: this.defaultInclude(),
        });
    }

    async remove(id: string, user: any) {
        this.ensureCanManage(user);

        const task = await this.prisma.task.findUnique({ where: { id } });

        if (!task) {
            throw new NotFoundException('Tarefa não encontrada.');
        }

        this.ensureStoreAccess(task.storeId, user);
        this.ensureTaskVisible(task, user);

        return this.prisma.task.update({
            where: { id },
            data: { active: false },
        });
    }

    // Próxima data (a partir de "fromDate", inclusive) em que a tarefa
    // vence, segundo a regra dela. Diária: o próprio dia. Semanal: o
    // próximo dia que bate com o dia da semana escolhido (pode ser hoje).
    // Mensal: o próximo dia do mês escolhido (com ajuste pro último dia,
    // se o mês for mais curto), nesse mês ou no seguinte. Ocasional: a
    // data fixa cadastrada.
    private nextDueDateOnOrAfter(
        task: Pick<Task, 'recurrence' | 'weekday' | 'dayOfMonth' | 'dueDate'>,
        fromDate: Date,
    ): Date {
        const from = this.startOfUtcDay(fromDate);

        if (task.recurrence === TaskRecurrence.DAILY) {
            return from;
        }

        if (task.recurrence === TaskRecurrence.WEEKLY) {
            const targetWeekday = task.weekday ?? 0;
            const diff = (targetWeekday - from.getUTCDay() + 7) % 7;

            return this.addDaysUtc(from, diff);
        }

        if (task.recurrence === TaskRecurrence.MONTHLY) {
            const targetDay = task.dayOfMonth ?? 1;

            const lastDayThisMonth = this.lastDayOfMonthUtc(
                from.getUTCFullYear(),
                from.getUTCMonth(),
            );
            const candidateThisMonth = new Date(
                Date.UTC(
                    from.getUTCFullYear(),
                    from.getUTCMonth(),
                    Math.min(targetDay, lastDayThisMonth),
                    12,
                ),
            );

            if (candidateThisMonth >= from) {
                return candidateThisMonth;
            }

            const nextMonthYear = from.getUTCMonth() === 11
                ? from.getUTCFullYear() + 1
                : from.getUTCFullYear();
            const nextMonthIndex = (from.getUTCMonth() + 1) % 12;
            const lastDayNextMonth = this.lastDayOfMonthUtc(
                nextMonthYear,
                nextMonthIndex,
            );

            return new Date(
                Date.UTC(
                    nextMonthYear,
                    nextMonthIndex,
                    Math.min(targetDay, lastDayNextMonth),
                    12,
                ),
            );
        }

        // ONCE
        return task.dueDate ? this.startOfUtcDay(task.dueDate) : from;
    }

    // Garante que existe uma TaskOccurrence pendente pra essa tarefa nessa
    // data — cria e notifica o responsável por fazer (e também quem criou
    // a tarefa, se for outra pessoa) só na primeira vez (upsert é
    // idempotente, então rodar de novo no mesmo dia não duplica aviso).
    private async ensureOccurrenceForDate(task: TaskWithAssignee, dueDate: Date) {
        const existing = await this.prisma.taskOccurrence.findUnique({
            where: { taskId_dueDate: { taskId: task.id, dueDate } },
        });

        if (existing) return existing;

        const occurrence = await this.prisma.taskOccurrence.create({
            data: {
                taskId: task.id,
                dueDate,
                status: TaskOccurrenceStatus.PENDING,
            },
        });

        const dueDateLabel = dueDate.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

        await this.notificationsService.create({
            title: 'Nova tarefa pra você',
            message: `"${task.title}" — prazo ${dueDateLabel}.`,
            type: NotificationType.TASK_ASSIGNED,
            userId: task.assignedToId,
        });

        if (task.createdById !== task.assignedToId) {
            await this.notificationsService.create({
                title: 'Tarefa atribuída',
                message: `"${task.title}" foi atribuída a ${task.assignedTo.name} — prazo ${dueDateLabel}.`,
                type: NotificationType.TASK_ASSIGNED,
                userId: task.createdById,
            });
        }

        return occurrence;
    }

    // Garante que a tarefa tem uma ocorrência atual ou futura pendente.
    // Ocasional: sempre a data fixa. Recorrentes: só calcula e cria a
    // próxima se a última gerada já venceu (ou se ainda não existe
    // nenhuma) — assim uma tarefa semanal criada numa terça já aparece de
    // imediato no quadro com o prazo da próxima sexta, em vez de ficar
    // invisível até o dia chegar.
    private async ensureNextOccurrence(task: TaskWithAssignee, today: Date) {
        if (task.recurrence === TaskRecurrence.ONCE) {
            if (task.dueDate) {
                await this.ensureOccurrenceForDate(
                    task,
                    this.startOfUtcDay(task.dueDate),
                );
            }

            return;
        }

        const startOfToday = this.startOfUtcDay(today);

        const latest = await this.prisma.taskOccurrence.findFirst({
            where: { taskId: task.id },
            orderBy: { dueDate: 'desc' },
        });

        if (latest && latest.dueDate >= startOfToday) {
            return;
        }

        const nextDate = this.nextDueDateOnOrAfter(task, today);
        await this.ensureOccurrenceForDate(task, nextDate);
    }

    // Roda todo dia de madrugada: gera a ocorrência do dia pra tarefas
    // diárias/semanais/mensais cujo ciclo bate hoje, e marca como
    // atrasada (+ avisa) qualquer ocorrência pendente cuja data já passou.
    @Cron(CronExpression.EVERY_DAY_AT_6AM)
    async runDailyGeneration() {
        const today = new Date();

        const activeTasks = await this.prisma.task.findMany({
            where: {
                active: true,
                recurrence: { in: [TaskRecurrence.DAILY, TaskRecurrence.WEEKLY, TaskRecurrence.MONTHLY] },
            },
            include: { assignedTo: { select: { name: true } } },
        });

        for (const task of activeTasks) {
            await this.ensureNextOccurrence(task, today);
        }

        await this.markOverdueOccurrences(today);
    }

    private async markOverdueOccurrences(today: Date) {
        const startOfToday = this.startOfUtcDay(today);

        const overdue = await this.prisma.taskOccurrence.findMany({
            where: {
                status: TaskOccurrenceStatus.PENDING,
                dueDate: { lt: startOfToday },
            },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        assignedToId: true,
                        createdById: true,
                        assignedTo: { select: { name: true } },
                    },
                },
            },
        });

        for (const occurrence of overdue) {
            await this.prisma.taskOccurrence.update({
                where: { id: occurrence.id },
                data: {
                    status: TaskOccurrenceStatus.LATE,
                    overdueNotifiedAt: new Date(),
                },
            });

            await this.notificationsService.create({
                title: 'Tarefa atrasada',
                message: `"${occurrence.task.title}" não foi confirmada e está atrasada.`,
                type: NotificationType.TASK_OVERDUE,
                userId: occurrence.task.assignedToId,
            });

            if (occurrence.task.createdById !== occurrence.task.assignedToId) {
                await this.notificationsService.create({
                    title: 'Tarefa atrasada',
                    message: `"${occurrence.task.title}", atribuída a ${occurrence.task.assignedTo.name}, está atrasada.`,
                    type: NotificationType.TASK_OVERDUE,
                    userId: occurrence.task.createdById,
                });
            }
        }
    }

    // Lista as ocorrências (quadro de tarefas). Administrativo/Proprietário
    // veem tudo da loja; os demais só veem a tarefa se foram eles quem
    // criaram ou se foi atribuída a eles.
    async findOccurrences(
        user: any,
        filters: {
            storeId: string;
            assignedToId?: string;
            status?: TaskOccurrenceStatus[];
            from?: string;
            to?: string;
        },
    ) {
        this.ensureStoreAccess(filters.storeId, user);

        const from = filters.from
            ? this.toDateNoonUtc(filters.from)
            : this.addDaysUtc(new Date(), -90);
        const to = filters.to
            ? this.toDateNoonUtc(filters.to)
            : this.addDaysUtc(new Date(), 30);

        return this.prisma.taskOccurrence.findMany({
            where: {
                dueDate: { gte: this.startOfUtcDay(from), lte: this.startOfUtcDay(to) },
                status: filters.status?.length ? { in: filters.status } : undefined,
                task: {
                    storeId: filters.storeId,
                    assignedToId: filters.assignedToId,
                    ...(GLOBAL_VIEW_ROLES.includes(user.role)
                        ? {}
                        : {
                            OR: [
                                { createdById: user.id },
                                { assignedToId: user.id },
                            ],
                        }),
                },
            },
            orderBy: { dueDate: 'desc' },
            include: {
                task: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        recurrence: true,
                        storeId: true,
                        assignedTo: { select: { id: true, name: true } },
                    },
                },
                confirmedBy: { select: { id: true, name: true } },
            },
        });
    }

    private canConfirm(
        occurrenceTask: { assignedToId: string; createdById: string },
        user: any,
    ) {
        if (GLOBAL_VIEW_ROLES.includes(user.role)) return true;

        return (
            occurrenceTask.assignedToId === user.id ||
            occurrenceTask.createdById === user.id
        );
    }

    async confirmOccurrence(id: string, user: any) {
        const occurrence = await this.prisma.taskOccurrence.findUnique({
            where: { id },
            include: { task: true },
        });

        if (!occurrence) {
            throw new NotFoundException('Tarefa não encontrada.');
        }

        this.ensureStoreAccess(occurrence.task.storeId, user);

        if (!this.canConfirm(occurrence.task, user)) {
            throw new ForbiddenException(
                'Só o responsável, quem criou a tarefa ou Administrativo/Proprietário podem confirmar.',
            );
        }

        const updated = await this.prisma.taskOccurrence.update({
            where: { id },
            data: {
                status: TaskOccurrenceStatus.DONE,
                confirmedAt: new Date(),
                confirmedById: user.id,
            },
        });

        // Avisa quem criou a tarefa (se não foi ela mesma quem confirmou)
        // que o responsável já concluiu.
        if (occurrence.task.createdById !== user.id) {
            await this.notificationsService.create({
                title: 'Tarefa confirmada',
                message: `"${occurrence.task.title}" foi confirmada por ${user.name}.`,
                type: NotificationType.TASK_CONFIRMED,
                userId: occurrence.task.createdById,
            });
        }

        return updated;
    }

    // Desfazer uma confirmação feita por engano — só gestão, pra evitar
    // que qualquer um reabra tarefa de outra pessoa.
    async undoConfirmation(id: string, user: any) {
        this.ensureCanManage(user);

        const occurrence = await this.prisma.taskOccurrence.findUnique({
            where: { id },
            include: { task: true },
        });

        if (!occurrence) {
            throw new NotFoundException('Tarefa não encontrada.');
        }

        this.ensureStoreAccess(occurrence.task.storeId, user);
        this.ensureTaskVisible(occurrence.task, user);

        const startOfToday = this.startOfUtcDay(new Date());
        const isLate = occurrence.dueDate < startOfToday;

        return this.prisma.taskOccurrence.update({
            where: { id },
            data: {
                status: isLate
                    ? TaskOccurrenceStatus.LATE
                    : TaskOccurrenceStatus.PENDING,
                confirmedAt: null,
                confirmedById: null,
            },
        });
    }
}
