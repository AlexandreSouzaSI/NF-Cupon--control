import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { WhatsappMessageKind } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import {
    TASK_OCCURRENCE_CREATED_EVENT,
    WHATSAPP_TASK_START_EVENT,
} from '../common/events';
import type {
    TaskOccurrenceCreatedEvent,
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

        if (!isStart || pending.kind !== WhatsappMessageKind.TASK_ASSIGNED) {
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
