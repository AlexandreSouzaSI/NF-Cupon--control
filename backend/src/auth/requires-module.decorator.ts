import { SetMetadata } from '@nestjs/common';
import { StoreModule } from '@prisma/client';

export const REQUIRES_MODULE_KEY = 'requiresModule';

// Marca uma rota (ou um controller inteiro) como pertencente a um módulo
// contratável — o ModuleAccessGuard barra o acesso se a loja da request
// não tiver esse módulo em Store.enabledModules. Metadado de método
// sobrescreve o de classe (mesmo mecanismo do @Roles/RolesGuard), então dá
// pra marcar um controller inteiro com um módulo e só as rotas que fogem
// da regra (ex: PurchasesController mistura Compras e Notas Fiscais)
// recebem seu próprio @RequiresModule por cima.
//
// Aceita um único módulo ou uma lista — nesse caso o guard libera se a
// loja tiver QUALQUER um deles habilitado (mesmo espírito do groupModules
// do menu no frontend, ver lib/menu.ts). Usado por telas "resumo" que
// dependem de mais de um módulo de verdade, como o Dashboard Financeiro
// (Contas a Pagar OU Conciliação de Caixa).
export const RequiresModule = (module: StoreModule | StoreModule[]) =>
    SetMetadata(REQUIRES_MODULE_KEY, module);
