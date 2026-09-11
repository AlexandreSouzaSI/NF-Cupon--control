import { StoreModule } from '@prisma/client';

// Nome amigável de cada módulo — usado na mensagem de erro do
// ModuleAccessGuard e reaproveitado pelo endpoint que alimenta o painel
// admin de módulos (pra não duplicar o texto em dois lugares).
export const MODULE_LABELS: Record<StoreModule, string> = {
    COMPRAS: 'Compras',
    NOTAS_FISCAIS: 'Notas Fiscais',
    SERVICOS: 'Serviços',
    TRIBUTOS: 'Tributos',
    PERDAS: 'Perdas',
    CONTAS_A_PAGAR: 'Contas a Pagar',
    TAREFAS: 'Tarefas',
    RELATORIOS: 'Relatórios',
    FUNCIONARIOS: 'Funcionários',
    FREELANCERS: 'Freelancers',
};

export const ALL_STORE_MODULES: StoreModule[] = Object.values(StoreModule);
