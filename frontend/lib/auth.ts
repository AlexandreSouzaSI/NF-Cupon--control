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