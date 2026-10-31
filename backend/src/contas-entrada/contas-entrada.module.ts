import { Module } from '@nestjs/common';

import { BillsModule } from '../bills/bills.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { ConciliacaoExtratoService } from './conciliacao-extrato.service';
import {
    ConciliacaoExtratoController,
    ContasEntradaController,
    ContasEntradaPublicController,
    RecebimentoAutomaticoController,
    OmieContasController,
    WhatsappRecebimentoWebhookController,
} from './contas-entrada.controller';
import { ContasEnviadasService } from './contas-enviadas.service';
import { EmailBoletosService } from './email-boletos.service';
import { OmieContasService } from './omie-contas.service';
import { PagamentosAvisadosService } from './pagamentos-avisados.service';
import { RecebimentoAutomaticoService } from './recebimento-automatico.service';
import { WhatsappRecebimentoService } from './whatsapp-recebimento.service';

// Contas a Pagar → Lançar Contas, Registrar Pagamentos, Conciliação do
// Extrato e Recebimento automático (WhatsApp + e-mail).
@Module({
    imports: [BillsModule, SuppliersModule],
    controllers: [
        ContasEntradaController,
        ConciliacaoExtratoController,
        RecebimentoAutomaticoController,
        ContasEntradaPublicController,
        WhatsappRecebimentoWebhookController,
        OmieContasController,
    ],
    providers: [
        ContasEnviadasService,
        PagamentosAvisadosService,
        ConciliacaoExtratoService,
        RecebimentoAutomaticoService,
        WhatsappRecebimentoService,
        EmailBoletosService,
        OmieContasService,
    ],
})
export class ContasEntradaModule { }
