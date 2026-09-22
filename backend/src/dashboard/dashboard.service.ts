import { ForbiddenException, Injectable } from '@nestjs/common';
import {
    PurchaseStatus,
    TaskOccurrenceStatus,
    UserRole,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Mesmo critério de "quem vê tudo" usado em tasks.service.ts — Proprietário
// e Administrativo enxergam o quadro da equipe inteira; os demais perfis só
// veem o próprio card de pendências pessoais.
const GLOBAL_TASK_VIEW_ROLES: UserRole[] = [
    UserRole.ADMINISTRATIVO,
    UserRole.PROPRIETARIO,
];

type TeamTaskStat = {
    userId: string;
    userName: string;
    aFazer: number;
    emAndamento: number;
    pausada: number;
    atraso: number;
    concluidas: number;
};

@Injectable()
export class DashboardService {
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

    // O dashboard é sempre sobre a loja ativa escolhida no topo do sistema,
    // nunca a soma de todas as lojas que o usuário tem acesso.
    private resolveStoreFilter(user: any, storeId?: string) {
        const allowedStoreIds = this.getAllowedStoreIds(user);

        if (storeId) {
            if (allowedStoreIds && !allowedStoreIds.includes(storeId)) {
                throw new ForbiddenException(
                    'Você não tem acesso a esta loja.',
                );
            }

            return storeId;
        }

        // Sem loja ativa informada: mantém o comportamento antigo como
        // fallback (todas as lojas permitidas), só pra não quebrar chamadas
        // feitas sem o parâmetro.
        return allowedStoreIds ? { in: allowedStoreIds } : undefined;
    }

    private getStartOfDay(date = new Date()) {
        const result = new Date(date);

        result.setHours(0, 0, 0, 0);

        return result;
    }

    private getEndOfDay(date = new Date()) {
        const result = new Date(date);

        result.setHours(23, 59, 59, 999);

        return result;
    }

    private getEndOfWeek(date = new Date()) {
        const result = new Date(date);

        result.setDate(result.getDate() + 7);
        result.setHours(23, 59, 59, 999);

        return result;
    }

    private getStartOfMonth(date = new Date()) {
        return new Date(
            date.getFullYear(),
            date.getMonth(),
            1,
            0,
            0,
            0,
            0,
        );
    }

    private getEndOfMonth(date = new Date()) {
        return new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
        );
    }

    // Aceita "AAAA-MM" (seletor de mês do Dashboard) e devolve o dia 1
    // daquele mês; qualquer coisa inválida ou ausente cai no mês corrente,
    // pra nunca quebrar o dashboard por causa de um parâmetro estranho.
    private resolveReferenceDate(month?: string): Date {
        if (month) {
            const match = /^(\d{4})-(\d{2})$/.exec(month);

            if (match) {
                const year = Number(match[1]);
                const monthIndex = Number(match[2]) - 1;

                if (monthIndex >= 0 && monthIndex <= 11) {
                    return new Date(year, monthIndex, 1);
                }
            }
        }

        return new Date();
    }

    async summary(user: any, storeId?: string, month?: string) {
        // Dashboard agora é só o resumo de Tarefas — o resto (compras,
        // perdas, financeiro, NF, faturamento...) já vive na própria tela
        // de cada módulo, não faz mais sentido duplicar aqui.
        const storeFilter = this.resolveStoreFilter(user, storeId);
        const isGlobalTaskViewer = GLOBAL_TASK_VIEW_ROLES.includes(
            user.role,
        );

        const referenceDate = this.resolveReferenceDate(month);
        const todayEnd = this.getEndOfDay();
        const monthStart = this.getStartOfMonth(referenceDate);
        const monthEnd = this.getEndOfMonth(referenceDate);

        // "AAAA-MM" do mês escolhido no seletor — usado só pra escopar o
        // "Concluídas (mês)" do quadro por pessoa.
        const currentReferenceMonth = `${monthStart.getFullYear()}-${String(
            monthStart.getMonth() + 1,
        ).padStart(2, '0')}`;

        const [myPendingTasks, teamTaskOccurrences] = await Promise.all([
            // Card pessoal: só as ocorrências atribuídas a quem está
            // olhando o dashboard, já vencidas ou vencendo hoje, ainda não
            // concluídas — "tarefas que eu sou obrigado a concluir".
            this.prisma.taskOccurrence.count({
                where: {
                    status: {
                        not: TaskOccurrenceStatus.DONE,
                    },
                    dueDate: {
                        lte: todayEnd,
                    },
                    task: {
                        storeId: storeFilter,
                        active: true,
                        assignedToId: user.id,
                    },
                },
            }),

            // Quadro por pessoa: só carregado pra quem enxerga tudo
            // (Proprietário/Administrativo) — pega o estado atual de cada
            // ocorrência em aberto, mais as concluídas dentro do mês
            // corrente (senão o total só cresceria pra sempre).
            isGlobalTaskViewer
                ? this.prisma.taskOccurrence.findMany({
                    where: {
                        task: {
                            storeId: storeFilter,
                            active: true,
                            // Proprietário nunca é restringido; Administrativo
                            // não deve ver no quadro geral nem os agregados
                            // de uma tarefa que o Proprietário restringiu
                            // especificamente pra ele.
                            ...(user.role === UserRole.ADMINISTRATIVO
                                ? { restrictedFromAdministrativo: false }
                                : {}),
                        },
                        OR: [
                            { status: { not: TaskOccurrenceStatus.DONE } },
                            {
                                status: TaskOccurrenceStatus.DONE,
                                confirmedAt: {
                                    gte: monthStart,
                                    lte: monthEnd,
                                },
                            },
                        ],
                    },
                    select: {
                        status: true,
                        task: {
                            select: {
                                assignedTo: {
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                })
                : Promise.resolve([]),
        ]);

        const teamBoardMap = new Map<string, TeamTaskStat>();

        for (const occurrence of teamTaskOccurrences as Array<{
            status: TaskOccurrenceStatus;
            task: { assignedTo: { id: string; name: string } | null };
        }>) {
            const assignee = occurrence.task.assignedTo;

            if (!assignee) continue;

            if (!teamBoardMap.has(assignee.id)) {
                teamBoardMap.set(assignee.id, {
                    userId: assignee.id,
                    userName: assignee.name,
                    aFazer: 0,
                    emAndamento: 0,
                    pausada: 0,
                    atraso: 0,
                    concluidas: 0,
                });
            }

            const stat = teamBoardMap.get(assignee.id)!;

            if (occurrence.status === TaskOccurrenceStatus.PENDING) {
                stat.aFazer += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.IN_PROGRESS) {
                stat.emAndamento += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.PAUSED) {
                stat.pausada += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.LATE) {
                stat.atraso += 1;
            } else if (occurrence.status === TaskOccurrenceStatus.DONE) {
                stat.concluidas += 1;
            }
        }

        const taskTeamBoard = Array.from(teamBoardMap.values()).sort(
            (a, b) => a.userName.localeCompare(b.userName),
        );

        return {
            referenceMonth: currentReferenceMonth,

            tasks: {
                pendingToday: myPendingTasks,
                team: taskTeamBoard,
            },
        };
    }

    async badges(user: any, storeId?: string) {
        const storeFilter = this.resolveStoreFilter(user, storeId);

        const [approvals, alerts, notifications] =
            await Promise.all([
                this.prisma.purchase.count({
                    where: {
                        storeId: storeFilter,
                        status:
                            PurchaseStatus.WAITING_APPROVAL,
                    },
                }),

                this.prisma.purchaseAlert.count({
                    where: {
                        resolved: false,
                        purchase: {
                            storeId: storeFilter,
                        },
                    },
                }),

                this.prisma.notification.count({
                    where: {
                        read: false,
                        OR: [
                            {
                                userId: user.id,
                            },
                            {
                                userId: null,
                            },
                        ],
                    },
                }),
            ]);

        return {
            approvals,
            alerts,
            notifications,
        };
    }
}