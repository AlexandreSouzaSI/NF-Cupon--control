import Cookies from 'js-cookie';

import { clearActiveStore } from './active-store';

export type UserRole =
    | 'ADMINISTRATIVO'
    | 'PROPRIETARIO'
    | 'GERENTE'
    | 'COMPRADOR'
    | 'ESTOQUISTA'
    | 'FINANCEIRO'
    | 'FUNCIONARIO';

export const roleLabels: Record<UserRole, string> = {
    ADMINISTRATIVO: 'Administrativo',
    PROPRIETARIO: 'Proprietário',
    GERENTE: 'Gerente',
    COMPRADOR: 'Comprador',
    ESTOQUISTA: 'Estoquista',
    FINANCEIRO: 'Financeiro',
    FUNCIONARIO: 'Funcionário',
};

// Perfis com acesso a todas as lojas, sem depender de vínculo em UserStore.
export const GLOBAL_ACCESS_ROLES: UserRole[] = [
    'ADMINISTRATIVO',
    'PROPRIETARIO',
];

export function hasGlobalStoreAccess(role: UserRole) {
    return GLOBAL_ACCESS_ROLES.includes(role);
}

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    // Dono do sistema — só true pra uma conta específica. Dá acesso total
    // independente do role, e é quem sempre pode cadastrar/editar outro
    // Proprietário.
    isAdminMaster?: boolean;
    // Permissão extra pra aprovar/reprovar compras, fora do que o perfil já
    // dá por padrão (Comprador/Proprietário/Admin Master) — ver
    // canApprovePurchase() abaixo e purchases.service.ts no backend.
    canApprovePurchases?: boolean;
    // Restrição extra de módulo por pessoa (além do perfil + loja) — vazio
    // ou ausente = sem restrição extra. Só o Proprietário edita isso pra
    // outra pessoa (ver Cadastros → Colaboradores). Espelha
    // User.moduleAccess no backend.
    moduleAccess?: string[];
    // Ver valor de conta categoria Funcionários/Freelancer em Contas a
    // Pagar — default true (não some pra ninguém até o Proprietário tirar
    // explicitamente). Espelha User.canViewPayrollBills no backend.
    canViewPayrollBills?: boolean;
    // Conta de teste grátis (autocadastro em /demo). demoExpiresAt vem como
    // string ISO (serializado no cookie) — bloqueado depois desse horário,
    // ver app-layout.tsx (banner) e lib/api.ts (401 força logout).
    isDemo?: boolean;
    demoExpiresAt?: string | null;
    stores: {
        id: string;
        name: string;
    }[];
};

// Quem pode cadastrar/editar um usuário de cada perfil — espelha
// ROLE_ASSIGNERS do backend (users.service.ts). Perfis fora daqui
// (legado: Comprador/Estoquista/Financeiro) caem no fallback.
const ROLE_ASSIGNERS: Partial<Record<UserRole, UserRole[]>> = {
    PROPRIETARIO: ['PROPRIETARIO'],
    ADMINISTRATIVO: ['PROPRIETARIO', 'ADMINISTRATIVO'],
    GERENTE: ['PROPRIETARIO', 'ADMINISTRATIVO'],
    FUNCIONARIO: ['PROPRIETARIO', 'ADMINISTRATIVO', 'GERENTE'],
};

const DEFAULT_ROLE_ASSIGNERS: UserRole[] = [
    'PROPRIETARIO',
    'ADMINISTRATIVO',
    'GERENTE',
];

export function canAssignRole(actingUser: AuthUser, targetRole: UserRole) {
    if (actingUser.isAdminMaster) return true;

    const allowed = ROLE_ASSIGNERS[targetRole] ?? DEFAULT_ROLE_ASSIGNERS;

    return allowed.includes(actingUser.role);
}

// Espelha canApprovePurchase() do backend (purchases.service.ts) — só pra
// decidir se mostra os botões Aprovar/Reprovar na tela. Quem não pode, o
// backend também recusa (403), isso aqui é só pra não mostrar um botão que
// vai dar erro.
export function canApprovePurchase(user: AuthUser | null) {
    if (!user) return false;
    if (user.isAdminMaster) return true;
    if (user.role === 'PROPRIETARIO' || user.role === 'COMPRADOR') return true;

    return user.canApprovePurchases === true;
}

// Só Admin Master ou Proprietário podem conceder/tirar a permissão extra
// canApprovePurchases de outro usuário — espelha
// ensureCanGrantApprovalPermission() do backend (users.service.ts).
export function canGrantApprovalPermission(user: AuthUser | null) {
    if (!user) return false;

    return Boolean(user.isAdminMaster) || user.role === 'PROPRIETARIO';
}

// Só Admin Master ou Proprietário podem editar moduleAccess/
// canViewPayrollBills de outro colaborador — espelha
// ensureCanGrantModuleAccess() do backend (users.service.ts). Mesma regra
// de canGrantApprovalPermission acima, campo diferente.
export function canGrantModuleAccess(user: AuthUser | null) {
    if (!user) return false;

    return Boolean(user.isAdminMaster) || user.role === 'PROPRIETARIO';
}

// "Aceitar e gerar conta a pagar" (Conciliar NF, Criar Conta a Pagar a
// partir de uma compra) — espelha canManagePurchaseBilling() do backend
// (purchases.service.ts). Estoquista continua só recebendo a compra
// (botão Receber, sem essa restrição).
export function canManagePurchaseBilling(user: AuthUser | null) {
    if (!user) return false;
    if (user.isAdminMaster) return true;

    return ['ADMINISTRATIVO', 'PROPRIETARIO', 'FINANCEIRO'].includes(
        user.role,
    );
}

// Convênio bancário (Sicredi) pra gerar o lançamento em lote — espelha
// canManagePaymentBatch() do backend (bills.service.ts). Só
// Proprietário/Administrativo (+Admin Master) veem a tela de
// configuração e o botão de gerar o arquivo.
export function canManagePaymentBatch(user: AuthUser | null) {
    if (!user) return false;
    if (user.isAdminMaster) return true;

    return ['ADMINISTRATIVO', 'PROPRIETARIO'].includes(user.role);
}

// Exclusão definitiva (de verdade, não "desativar") em qualquer cadastro
// do sistema — Fornecedores, Colaboradores, Lojas, Usuários, Cartões,
// Freelancers, categorias — restrita só à conta dona do sistema. Espelha
// AdminMasterGuard no backend.
export function canDeleteForever(user: AuthUser | null) {
    return Boolean(user?.isAdminMaster);
}

// Editar cadastro de Fornecedor (nome/CNPJ/telefone) — Administrativo e
// Proprietário, além do Admin Master. Espelha o que o backend já aceita em
// PUT /suppliers/:id (sem restrição de role lá, então o controle é só
// aqui na UI).
export function canEditSupplier(user: AuthUser | null) {
    if (!user) return false;
    if (user.isAdminMaster) return true;

    return ['ADMINISTRATIVO', 'PROPRIETARIO'].includes(user.role);
}

export function getToken() {
    return Cookies.get('token');
}

export function getUser(): AuthUser | null {
    const user = Cookies.get('user');

    if (!user) {
        return null;
    }

    try {
        return JSON.parse(user);
    } catch {
        return null;
    }
}

export function logout() {
    Cookies.remove('token');
    Cookies.remove('user');
    clearActiveStore();
}