// Contratos de eventos internos compartilhados entre módulos que não
// devem depender um do outro diretamente (ex: Tarefas e WhatsApp — Tarefas
// não sabe nada sobre WhatsApp, WhatsApp não sabe nada sobre Tarefas, os
// dois só conversam via EventEmitter2). Ficam num arquivo neutro pra
// nenhum dos dois módulos importar pasta do outro.

// Disparado sempre que uma TaskOccurrence nova é criada e o responsável
// precisa ser avisado. Quem estiver ouvindo decide o que fazer (hoje: só
// WhatsappService manda a mensagem, se a pessoa tiver telefone).
export const TASK_OCCURRENCE_CREATED_EVENT = 'task.occurrence.created';

export type TaskOccurrenceCreatedEvent = {
    userId: string;
    phone: string | null;
    taskOccurrenceId: string;
    title: string;
    description?: string | null;
    dueDateLabel: string;
};

// Disparado quando alguém responde no WhatsApp com uma palavra reconhecida
// como "comecei a fazer". Quem estiver ouvindo decide como aplicar (hoje:
// só TasksService, chamando o mesmo startOccurrence() usado pelo botão no
// quadro).
export const WHATSAPP_TASK_START_EVENT = 'whatsapp.task.start';

export type WhatsappTaskStartEvent = {
    taskOccurrenceId: string;
    userId: string;
};
