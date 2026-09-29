import { beforeEach, describe, expect, it, vi } from 'vitest';

// auth.ts (e active-store.ts, usado por logout()) leem/escrevem cookie via
// js-cookie — mocka com um Map em memória pra não depender de
// document.cookie real (ambiente 'node', sem jsdom).
const cookieStore = new Map<string, string>();

vi.mock('js-cookie', () => ({
    default: {
        get: (key: string) => cookieStore.get(key),
        set: (key: string, value: string) => {
            cookieStore.set(key, value);
        },
        remove: (key: string) => {
            cookieStore.delete(key);
        },
    },
}));

import {
    canApprovePurchase,
    canAssignRole,
    canDeleteForever,
    canEditSupplier,
    canGrantApprovalPermission,
    canGrantModuleAccess,
    canManagePaymentBatch,
    canManagePurchaseBilling,
    getToken,
    getUser,
    logout,
    type AuthUser,
} from './auth';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
    return {
        id: 'u-1',
        name: 'Fulano',
        email: 'fulano@x.com',
        role: 'FUNCIONARIO',
        stores: [],
        ...overrides,
    };
}

beforeEach(() => {
    cookieStore.clear();
});

describe('canAssignRole — espelha ROLE_ASSIGNERS do backend', () => {
    it('bloqueia Administrativo de atribuir perfil Proprietário', () => {
        expect(
            canAssignRole(user({ role: 'ADMINISTRATIVO' }), 'PROPRIETARIO'),
        ).toBe(false);
    });

    it('permite Proprietário atribuir perfil Proprietário', () => {
        expect(
            canAssignRole(user({ role: 'PROPRIETARIO' }), 'PROPRIETARIO'),
        ).toBe(true);
    });

    it('permite Administrativo atribuir perfil Gerente', () => {
        expect(
            canAssignRole(user({ role: 'ADMINISTRATIVO' }), 'GERENTE'),
        ).toBe(true);
    });

    it('bloqueia Gerente de atribuir perfil Administrativo', () => {
        expect(
            canAssignRole(user({ role: 'GERENTE' }), 'ADMINISTRATIVO'),
        ).toBe(false);
    });

    it('permite Gerente atribuir perfil Funcionário', () => {
        expect(
            canAssignRole(user({ role: 'GERENTE' }), 'FUNCIONARIO'),
        ).toBe(true);
    });

    it('bloqueia Funcionário de atribuir perfil Funcionário', () => {
        expect(
            canAssignRole(user({ role: 'FUNCIONARIO' }), 'FUNCIONARIO'),
        ).toBe(false);
    });

    it('perfil legado (fora da matriz) cai no fallback padrão', () => {
        expect(
            canAssignRole(user({ role: 'GERENTE' }), 'COMPRADOR'),
        ).toBe(true);
        expect(
            canAssignRole(user({ role: 'FUNCIONARIO' }), 'COMPRADOR'),
        ).toBe(false);
    });

    it('Admin Master sempre pode, independente da matriz', () => {
        expect(
            canAssignRole(
                user({ role: 'FUNCIONARIO', isAdminMaster: true }),
                'PROPRIETARIO',
            ),
        ).toBe(true);
    });
});

describe('canApprovePurchase', () => {
    it('null nunca pode', () => {
        expect(canApprovePurchase(null)).toBe(false);
    });

    it('Admin Master sempre pode', () => {
        expect(
            canApprovePurchase(user({ role: 'FUNCIONARIO', isAdminMaster: true })),
        ).toBe(true);
    });

    it('Proprietário e Comprador sempre podem', () => {
        expect(canApprovePurchase(user({ role: 'PROPRIETARIO' }))).toBe(true);
        expect(canApprovePurchase(user({ role: 'COMPRADOR' }))).toBe(true);
    });

    it('Funcionário só pode com a permissão extra concedida', () => {
        expect(
            canApprovePurchase(user({ role: 'FUNCIONARIO', canApprovePurchases: false })),
        ).toBe(false);
        expect(
            canApprovePurchase(user({ role: 'FUNCIONARIO', canApprovePurchases: true })),
        ).toBe(true);
    });
});

describe('canGrantApprovalPermission / canGrantModuleAccess', () => {
    it('só Admin Master ou Proprietário podem conceder', () => {
        expect(canGrantApprovalPermission(null)).toBe(false);
        expect(
            canGrantApprovalPermission(user({ role: 'ADMINISTRATIVO' })),
        ).toBe(false);
        expect(canGrantApprovalPermission(user({ role: 'PROPRIETARIO' }))).toBe(
            true,
        );
        expect(
            canGrantApprovalPermission(
                user({ role: 'FUNCIONARIO', isAdminMaster: true }),
            ),
        ).toBe(true);

        expect(canGrantModuleAccess(user({ role: 'ADMINISTRATIVO' }))).toBe(
            false,
        );
        expect(canGrantModuleAccess(user({ role: 'PROPRIETARIO' }))).toBe(true);
    });
});

describe('canManagePurchaseBilling', () => {
    it('Administrativo, Proprietário e Financeiro podem; Gerente não', () => {
        expect(canManagePurchaseBilling(user({ role: 'ADMINISTRATIVO' }))).toBe(
            true,
        );
        expect(canManagePurchaseBilling(user({ role: 'PROPRIETARIO' }))).toBe(
            true,
        );
        expect(canManagePurchaseBilling(user({ role: 'FINANCEIRO' }))).toBe(
            true,
        );
        expect(canManagePurchaseBilling(user({ role: 'GERENTE' }))).toBe(false);
    });
});

describe('canManagePaymentBatch', () => {
    it('Administrativo e Proprietário podem; Financeiro não', () => {
        expect(canManagePaymentBatch(user({ role: 'ADMINISTRATIVO' }))).toBe(
            true,
        );
        expect(canManagePaymentBatch(user({ role: 'PROPRIETARIO' }))).toBe(true);
        expect(canManagePaymentBatch(user({ role: 'FINANCEIRO' }))).toBe(false);
    });
});

describe('canDeleteForever', () => {
    it('só Admin Master', () => {
        expect(canDeleteForever(null)).toBe(false);
        expect(canDeleteForever(user({ role: 'PROPRIETARIO' }))).toBe(false);
        expect(
            canDeleteForever(user({ role: 'FUNCIONARIO', isAdminMaster: true })),
        ).toBe(true);
    });
});

describe('canEditSupplier', () => {
    it('Administrativo e Proprietário podem; Gerente não', () => {
        expect(canEditSupplier(user({ role: 'ADMINISTRATIVO' }))).toBe(true);
        expect(canEditSupplier(user({ role: 'PROPRIETARIO' }))).toBe(true);
        expect(canEditSupplier(user({ role: 'GERENTE' }))).toBe(false);
    });
});

describe('getToken / getUser / logout — cookie', () => {
    it('getToken devolve undefined sem cookie', () => {
        expect(getToken()).toBeUndefined();
    });

    it('getUser devolve null sem cookie', () => {
        expect(getUser()).toBeNull();
    });

    it('getUser devolve null com JSON corrompido no cookie', () => {
        cookieStore.set('user', '{not-json');
        expect(getUser()).toBeNull();
    });

    it('getUser faz parse normal do cookie válido', () => {
        const stored = user({ id: 'u-9' });
        cookieStore.set('user', JSON.stringify(stored));
        expect(getUser()).toEqual(stored);
    });

    it('logout limpa token, user e loja ativa', () => {
        cookieStore.set('token', 'abc');
        cookieStore.set('user', '{}');
        cookieStore.set('activeStore', '{}');

        logout();

        expect(cookieStore.has('token')).toBe(false);
        expect(cookieStore.has('user')).toBe(false);
        expect(cookieStore.has('activeStore')).toBe(false);
    });
});
