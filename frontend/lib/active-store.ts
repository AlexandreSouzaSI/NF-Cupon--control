import Cookies from 'js-cookie';

const ACTIVE_STORE_COOKIE = 'activeStore';

export type ActiveStore = {
    id: string;
    name: string;
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
