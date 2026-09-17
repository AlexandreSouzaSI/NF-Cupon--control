import { Logger, Module } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WHATSAPP_PROVIDER } from './whatsapp-provider.interface';
import { LogWhatsappProvider } from './providers/log-whatsapp.provider';
import { EvolutionWhatsappProvider } from './providers/evolution-whatsapp.provider';

const moduleLogger = new Logger('WhatsappModule');

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
        // Único lugar que precisa mudar pra trocar de provedor real — se
        // EVOLUTION_API_URL + EVOLUTION_INSTANCE estiverem definidas (ver
        // .env.example), usa a Evolution API de verdade; senão cai pro
        // LogWhatsappProvider (só loga, não manda nada) pra nunca quebrar
        // o resto do sistema.
        {
            provide: WHATSAPP_PROVIDER,
            useFactory: () => {
                if (process.env.EVOLUTION_API_URL && process.env.EVOLUTION_INSTANCE) {
                    moduleLogger.log(
                        `WhatsApp usando Evolution API (instância "${process.env.EVOLUTION_INSTANCE}").`,
                    );

                    return new EvolutionWhatsappProvider();
                }

                moduleLogger.warn(
                    'WhatsApp sem provedor real configurado — mensagens só vão pro log (ver EVOLUTION_API_URL no .env.example).',
                );

                return new LogWhatsappProvider();
            },
        },
    ],
    exports: [WhatsappService],
})
export class WhatsappModule { }
