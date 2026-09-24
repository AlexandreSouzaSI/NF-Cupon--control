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

// Disparado quando o cron vira uma ocorrência pendente pra "Atrasada" —
// mesma ideia do TASK_OCCURRENCE_CREATED_EVENT, só que pra cutucar o
// responsável que ainda não iniciou. Quem estiver ouvindo decide o que
// fazer (hoje: WhatsappService manda a mensagem, se a pessoa tiver
// telefone).
export const TASK_OCCURRENCE_OVERDUE_EVENT = 'task.occurrence.overdue';

export type TaskOccurrenceOverdueEvent = {
    userId: string;
    phone: string | null;
    taskOccurrenceId: string;
    title: string;
    dueDateLabel: string;
};

// Disparado quando alguém que gerencia tarefas clica em "Notificar
// WhatsApp" no card de uma ocorrência, pra cutucar o responsável na hora
// (sem esperar o cron de atraso). Mesmo formato do evento de atraso — quem
// estiver ouvindo decide o texto (hoje: WhatsappService manda como
// lembrete, ver src/common/events.ts).
export const TASK_OCCURRENCE_REMINDER_EVENT = 'task.occurrence.reminder';

export type TaskOccurrenceReminderEvent = {
    userId: string;
    phone: string | null;
    taskOccurrenceId: string;
    title: string;
    dueDateLabel: string;
};

// Disparado depois que uma planilha de vendas (aba Produtos) termina de
// ser importada com sucesso. Quem estiver ouvindo decide o que fazer
// (hoje: EstoqueService calcula o consumo daquela importação via ficha
// técnica e baixa dos StockItem vinculados — ver estoque.service.ts).
// ProductSalesService não sabe nada sobre Estoque, e vice-versa; os dois
// só se falam por aqui, evitando dependência circular entre os módulos.
export const PRODUCT_SALES_IMPORTED_EVENT = 'product-sales.imported';

export type ProductSalesImportedEvent = {
    storeId: string;
    productSalesImportId: string;
};

// Disparado uma vez por fornecedor convidado, sempre que uma Quotation é
// enviada (Fase 3 do fluxo de Cotação). QuotationsService não sabe nada
// sobre WhatsApp — só monta o link único (QuotationSupplier.token) e
// dispara esse evento; quem estiver ouvindo decide o texto e manda (hoje:
// só WhatsappService, se o fornecedor tiver telefone).
export const QUOTATION_SUPPLIER_INVITED_EVENT = 'quotation.supplier.invited';

export type QuotationSupplierInvitedEvent = {
    userId: string; // quem disparou o envio (Quotation.createdById), pra auditoria
    phone: string;
    quotationSupplierId: string;
    supplierName: string;
    categoryName: string;
    storeName: string;
    link: string;
    itemsCount: number;
};

// Disparado quando o comprador pede a confirmação do pedido pro
// fornecedor vencedor (Fase 6 do fluxo de Cotação) — depois que ele já
// escolheu quem ganhou (Fase 5). Mesmo espírito do evento acima:
// QuotationsService só monta o link (QuotationSupplier.confirmToken) e
// dispara, quem estiver ouvindo decide o texto e manda.
export const QUOTATION_ORDER_CONFIRM_REQUESTED_EVENT =
    'quotation.order-confirm.requested';

export type QuotationOrderConfirmRequestedEvent = {
    userId: string;
    phone: string;
    quotationSupplierId: string;
    supplierName: string;
    categoryName: string;
    storeName: string;
    link: string;
    total: number;
};
