import { Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { LogWhatsappProvider } from './providers/log-whatsapp.provider';

// De propósito sem import de TasksModule (nem de nenhum outro módulo de
// domínio) — a comunicação é só via EventEmitter2 (global, registrado em
// AppModule), ver src/common/events.ts. Isso evita dependência circular
// entre Tarefas ↔ WhatsApp e deixa esse módulo plugável em qualquer outro
// fluxo (Perdas, Aprovações etc.) no futuro sem precisar mexer aqui.
@Module({
    controllers: [WhatsappController],
    providers: [
        WhatsappService,
        PrismaService,
        // Único lugar que precisa mudar pra trocar de provedor real —
        // ver whatsapp-provider.interface.ts.
        { provide: WHATSAPP_PROVIDER, useClass: LogWhatsappProvider },
    ],
    exports: [WhatsappService],
})
export class WhatsappModule { }
