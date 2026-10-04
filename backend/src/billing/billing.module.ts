import { Module } from '@nestjs/common';

import { AsaasClient } from './asaas.client';
import {
    AdminSubscriptionsController,
    BillingController,
} from './billing.controller';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingService } from './billing.service';
import { AdminPlansController, PlansController } from './plans.controller';
import { PlansService } from './plans.service';

// Planos + cobrança (Asaas). PrismaModule é global (ver app.module.ts).
@Module({
    controllers: [
        PlansController,
        AdminPlansController,
        BillingController,
        BillingWebhookController,
        AdminSubscriptionsController,
    ],
    providers: [PlansService, BillingService, AsaasClient],
    exports: [BillingService],
})
export class BillingModule { }
