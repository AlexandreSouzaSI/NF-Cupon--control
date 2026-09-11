import Cookies from 'js-cookie';
import type { StoreModuleKey } from './menu';

const ACTIVE_STORE_COOKIE = 'activeStore';

export type ActiveStore = {
    id: string;
    name: string;
    // Módulos contratados pra essa loja (painel /admin/modules) — usado
    // pra filtrar o menu. Opcional/undefined em cookies antigos (de antes
    // dessa feature) — nesse caso o menu trata como "libera tudo" até o
    // próximo resolveActiveStore trazer o valor de verdade.
    enabledModules?: StoreModuleKey[];
};

export function getActiveStore(): ActiveStore | null {
    const raw = Cookies.get(ACTIVE_STORE_COOKIE);

    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);

        if (parsed && typeof parsed.id === 'string') {
            return parsed;
        }

        return null;
    } catch {
        return null;
    }
}

export function setActiveStore(store: ActiveStore) {
    Cookies.set(ACTIVE_STORE_COOKIE, JSON.stringify(store));
}

export function clearActiveStore() {
    Cookies.remove(ACTIVE_STORE_COOKIE);
}
