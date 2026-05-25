import Cookies from 'js-cookie';

export type AuthUser = {
    id: string;
    name: string;
    email: string;
    role: string;
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
}