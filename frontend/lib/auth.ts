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
    stores: {
        id: string;
        name: string;
    }[];
};

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