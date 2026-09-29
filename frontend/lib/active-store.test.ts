import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    clearActiveStore,
    getActiveStore,
    setActiveStore,
} from './active-store';

beforeEach(() => {
    cookieStore.clear();
});

describe('getActiveStore', () => {
    it('devolve null quando não há cookie', () => {
        expect(getActiveStore()).toBeNull();
    });

    it('devolve null com JSON corrompido no cookie', () => {
        cookieStore.set('activeStore', '{not-json');
        expect(getActiveStore()).toBeNull();
    });

    it('devolve null quando o JSON é válido mas não tem id de loja', () => {
        cookieStore.set('activeStore', JSON.stringify({ name: 'Sem id' }));
        expect(getActiveStore()).toBeNull();
    });

    it('devolve a loja quando o cookie é válido', () => {
        const store = { id: 'store-1', name: 'Anchieta' };
        cookieStore.set('activeStore', JSON.stringify(store));

        expect(getActiveStore()).toEqual(store);
    });
});

describe('setActiveStore / clearActiveStore', () => {
    it('grava a loja e depois lê de volta', () => {
        setActiveStore({ id: 'store-2', name: 'Contagem' });

        expect(getActiveStore()).toEqual({ id: 'store-2', name: 'Contagem' });
    });

    it('clearActiveStore remove o cookie', () => {
        setActiveStore({ id: 'store-2', name: 'Contagem' });
        clearActiveStore();

        expect(getActiveStore()).toBeNull();
    });
});
