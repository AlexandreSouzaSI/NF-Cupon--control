import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappMessageKind } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import {
    QUOTATION_ORDER_CONFIRM_REQUESTED_EVENT,
    QUOTATION_SUPPLIER_INVITED_EVENT,
    TASK_OCCURRENCE_CREATED_EVENT,
    TASK_OCCURRENCE_OVERDUE_EVENT,
    TASK_OCCURRENCE_REMINDER_EVENT,
    WHATSAPP_TASK_START_EVENT,
} from '../common/events';
import type {
    QuotationOrderConfirmRequestedEvent,
    QuotationSupplierInvitedEvent,
    TaskOccurrenceCreatedEvent,
    TaskOccurrenceOverdueEvent,
    TaskOccurrenceReminderEvent,
    WhatsappTaskStartEvent,
} from '../common/events';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import type { WhatsappProvider } from './whatsapp-provider.interface';

// Palavras reconhecidas como "quero começar essa tarefa" — comparação sem
// acento e em minúsculo (normalizeText). Lista curta de propósito: melhor
// a pessoa não ser reconhecida (e a gente ampliar a lista depois) do que
// reconhecer errado e mudar status sem querer.
const START_KEYWORDS = [
    'iniciar',
    'iniciando',
    'inicio',
    'comecei',
    'comecar',
    'comecando',
    'start',
];

const DIACRITICS_REGEX = /[̀-ͯ]/g;

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(DIACRITICS_REGEX, '')
        .trim()
        .toLowerCase();
}

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);

    constructor(
        private prisma: PrismaService,
        private eventEmitter: EventEmitter2,
        @Inject(WHATSAPP_PROVIDER) private provider: WhatsappProvider,
    ) { }

    // Ouve o mesmo evento que qualquer outro módulo poderia escutar — não
    // é chamado diretamente por TasksService, o que mantém os dois módulos
    // sem se conhecerem (ver src/common/events.ts).
    @OnEvent(TASK_OCCURRENCE_CREATED_EVENT)
    async handleTaskOccurrenceCreated(payload: TaskOccurrenceCreatedEvent) {
        await this.sendTaskAssigned(payload);
    }

    // Mesma ideia, mas pro aviso de atraso — dispara quando o cron vira
    // uma ocorrência pendente pra "Atrasada" (ver src/common/events.ts).
    @OnEvent(TASK_OCCURRENCE_OVERDUE_EVENT)
    async handleTaskOccurrenceOverdue(payload: TaskOccurrenceOverdueEvent) {
        await this.sendTaskOverdue(payload);
    }

    // Lembrete manual — alguém que gerencia tarefas clicou em "Notificar
    // WhatsApp" no card da ocorrência (ver src/common/events.ts).
    @OnEvent(TASK_OCCURRENCE_REMINDER_EVENT)
    async handleTaskOccurrenceReminder(payload: TaskOccurrenceReminderEvent) {
        await this.sendTaskReminder(payload);
    }

    // Cotação: um fornecedor foi convidado pra preencher preço (Fase 3 —
    // ver src/common/events.ts). QuotationsService não sabe como a
    // mensagem é montada, só que precisa avisar esse fornecedor.
    @OnEvent(QUOTATION_SUPPLIER_INVITED_EVENT)
    async handleQuotationSupplierInvited(payload: QuotationSupplierInvitedEvent) {
        await this.sendQuotationRequest(payload);
    }

    // Cotação: o comprador escolheu esse fornecedor como vencedor e pediu
    // a confirmação do pedido (Fase 6 — ver src/common/events.ts).
    @OnEvent(QUOTATION_ORDER_CONFIRM_REQUESTED_EVENT)
    async handleQuotationOrderConfirmRequested(
        payload: QuotationOrderConfirmRequestedEvent,
    ) {
        await this.sendQuotationOrderConfirmation(payload);
    }

    // Não lança erro se a pessoa não tem telefone cadastrado — só não
    // manda nada (o aviso dentro do app, via NotificationsService, continua
    // funcionando normal de qualquer forma).
    private async sendTaskAssigned(params: TaskOccurrenceCreatedEvent) {
        if (!params.phone) return;

        const phone = normalizePhone(params.phone);

        const lines = [
            `Nova tarefa pra você: *${params.title}*`,
            params.description || undefined,
            `Prazo: ${params.dueDateLabel}`,
            '',
            'Responda "iniciar" quando começar a fazer.',
        ].filter((line): line is string => Boolean(line));

        const text = lines.join('\n');

        let providerMessageId: string | undefined;

        try {
            const result = await this.provider.sendText(phone, text);
            providerMessageId = result.providerMessageId;
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar WhatsApp pra ${phone}: ${error?.message || error}`,
            );
        }

        await this.prisma.whatsappOutboundMessage.create({
            data: {
                userId: params.userId,
                phone,
                kind: WhatsappMessageKind.TASK_ASSIGNED,
                taskOccurrenceId: params.taskOccurrenceId,
                text,
                providerMessageId,
            },
        });
    }

    // Mesma lógica de sendTaskAssigned, mas pro aviso de atraso — dispara
    // quando o cron vira uma ocorrência pendente pra "Atrasada" (uma vez
    // só, já que o cron só processa ocorrência PENDING — depois de virar
    // LATE ela não entra de novo no filtro, então não duplica aviso).
    private async sendTaskOverdue(params: TaskOccurrenceOverdueEvent) {
        if (!params.phone) return;

        const phone = normalizePhone(params.phone);

        const text = [
            `⏰ Tarefa atrasada: *${params.title}*`,
            `Prazo era ${params.dueDateLabel} e ainda não foi iniciada.`,
            '',
            'Responda "iniciar" pra começar agora.',
        ].join('\n');

        let providerMessageId: string | undefined;

        try {
            const result = await this.provider.sendText(phone, text);
            providerMessageId = result.providerMessageId;
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar WhatsApp de atraso pra ${phone}: ${error?.message || error}`,
            );
        }

        await this.prisma.whatsappOutboundMessage.create({
            data: {
                userId: params.userId,
                phone,
                kind: WhatsappMessageKind.TASK_OVERDUE,
                taskOccurrenceId: params.taskOccurrenceId,
                text,
                providerMessageId,
            },
        });
    }

    // Mesma lógica de sendTaskAssigned, mas pro lembrete manual disparado
    // pelo botão "Notificar WhatsApp" — quem gerencia tarefas pode mandar
    // quantas vezes quiser, não é uma vez só como o de atraso.
    private async sendTaskReminder(params: TaskOccurrenceReminderEvent) {
        if (!params.phone) return;

        const phone = normalizePhone(params.phone);

        const text = [
            `🔔 Lembrete: tarefa pendente: *${params.title}*`,
            `Prazo: ${params.dueDateLabel}`,
            '',
            'Responda "iniciar" pra começar agora.',
        ].join('\n');

        let providerMessageId: string | undefined;

        try {
            const result = await this.provider.sendText(phone, text);
            providerMessageId = result.providerMessageId;
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar lembrete de WhatsApp pra ${phone}: ${error?.message || error}`,
            );
        }

        await this.prisma.whatsappOutboundMessage.create({
            data: {
                userId: params.userId,
                phone,
                kind: WhatsappMessageKind.TASK_REMINDER,
                taskOccurrenceId: params.taskOccurrenceId,
                text,
                providerMessageId,
            },
        });
    }

    // Mesma lógica de sendTaskReminder, mas pro convite de cotação — o
    // fornecedor não responde "iniciar" nem nada parecido aqui, o link é
    // uma página pública própria (Fase 4) onde ele preenche o preço, não
    // um fluxo por palavra-chave no WhatsApp.
    private async sendQuotationRequest(params: QuotationSupplierInvitedEvent) {
        const phone = normalizePhone(params.phone);

        const text = [
            `Olá, ${params.supplierName}! Pedimos uma cotação de *${params.categoryName}* pra ${params.storeName}.`,
            `${params.itemsCount} ${params.itemsCount === 1 ? 'item' : 'itens'} na lista.`,
            '',
            `Preencha os preços aqui: ${params.link}`,
        ].join('\n');

        let providerMessageId: string | undefined;

        try {
            const result = await this.provider.sendText(phone, text);
            providerMessageId = result.providerMessageId;
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar convite de cotação pra ${phone}: ${error?.message || error}`,
            );
        }

        await this.prisma.whatsappOutboundMessage.create({
            data: {
                userId: params.userId,
                phone,
                kind: WhatsappMessageKind.QUOTATION_REQUEST,
                quotationSupplierId: params.quotationSupplierId,
                text,
                providerMessageId,
            },
        });
    }

    // Mesma lógica de sendQuotationRequest, mas pro convite de confirmação
    // de pedido — o fornecedor já ganhou a cotação (Fase 5), esse link
    // (Fase 6) é só pra ele bater o martelo e a Purchase nascer sozinha.
    private async sendQuotationOrderConfirmation(
        params: QuotationOrderConfirmRequestedEvent,
    ) {
        const phone = normalizePhone(params.phone);

        const totalLabel = params.total.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });

        const text = [
            `Você ganhou a cotação de *${params.categoryName}* pra ${params.storeName}!`,
            `Valor total do pedido: ${totalLabel}.`,
            '',
            `Confirme o pedido aqui: ${params.link}`,
        ].join('\n');

        let providerMessageId: string | undefined;

        try {
            const result = await this.provider.sendText(phone, text);
            providerMessageId = result.providerMessageId;
        } catch (error: any) {
            this.logger.warn(
                `Falha ao enviar confirmação de pedido pra ${phone}: ${error?.message || error}`,
            );
        }

        await this.prisma.whatsappOutboundMessage.create({
            data: {
                userId: params.userId,
                phone,
                kind: WhatsappMessageKind.QUOTATION_ORDER_CONFIRMATION,
                quotationSupplierId: params.quotationSupplierId,
                text,
                providerMessageId,
            },
        });
    }

    // Chamado pelo controller do webhook, já com o payload específico do
    // provedor traduzido pra { phone, text }. Acha a mensagem mais recente
    // ainda sem resposta pra esse telefone e confere se o texto bate com
    // uma ação reconhecida — hoje só "iniciar tarefa".
    async handleInboundMessage(rawPhone: string, text: string) {
        const phone = normalizePhone(rawPhone);
        const normalizedText = normalizeText(text);

        const pending = await this.prisma.whatsappOutboundMessage.findFirst({
            where: { phone, respondedAt: null },
            orderBy: { sentAt: 'desc' },
        });

        if (!pending) {
            this.logger.log(
                `Mensagem de ${phone} sem contexto pendente pra responder: "${text}"`,
            );
            return { matched: false };
        }

        const isStart = START_KEYWORDS.some(
            (keyword) =>
                normalizedText === keyword ||
                normalizedText.startsWith(`${keyword} `),
        );

        // Aviso de nova tarefa, de atraso e lembrete manual todos convidam
        // a responder "iniciar" — os três viram o mesmo startOccurrence().
        const isTaskStartContext =
            pending.kind === WhatsappMessageKind.TASK_ASSIGNED ||
            pending.kind === WhatsappMessageKind.TASK_OVERDUE ||
            pending.kind === WhatsappMessageKind.TASK_REMINDER;

        if (!isStart || !isTaskStartContext) {
            // Guarda a resposta mesmo sem reconhecer, pra dar pra olhar
            // depois (ex: relatório de mensagens não reconhecidas).
            await this.prisma.whatsappOutboundMessage.update({
                where: { id: pending.id },
                data: { responseText: text },
            });

            return { matched: false };
        }

        await this.prisma.whatsappOutboundMessage.update({
            where: { id: pending.id },
            data: {
                respondedAt: new Date(),
                responseText: text,
                respondedAction: 'STARTED',
            },
        });

        if (pending.taskOccurrenceId) {
            const startEvent: WhatsappTaskStartEvent = {
                taskOccurrenceId: pending.taskOccurrenceId,
                userId: pending.userId,
            };

            this.eventEmitter.emit(WHATSAPP_TASK_START_EVENT, startEvent);
        }

        return { matched: true };
    }
}
