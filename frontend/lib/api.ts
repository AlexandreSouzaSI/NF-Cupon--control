import axios from 'axios';
import Cookies from 'js-cookie';
import { getActiveStore } from './active-store';

// Em produção (Railway, etc.) defina NEXT_PUBLIC_API_URL apontando pra URL
// pública do backend. Sem essa variável, cai no localhost de sempre pro
// desenvolvimento local.
export const API_URL =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.request.use((config) => {
    const token = Cookies.get('token');

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    // Manda a loja ativa (seletor no topo) em todo request. Pra usuário
    // normal isso não muda nada (ele já só vê a própria empresa, com ou
    // sem esse header). Pro Admin Master é o que permite o backend saber
    // "de qual empresa" filtrar os cadastros globais (Fornecedores,
    // Categorias, Config de lote, Colaboradores) — sem isso ele via tudo
    // misturado de todas as empresas-cliente. Ver jwt.strategy.ts.
    const activeStore = getActiveStore();

    if (activeStore?.id) {
        config.headers['x-store-id'] = activeStore.id;
    }

    return config;
});

// Sem isso, uma sessão que expirou no meio do uso (ex: teste grátis vencido
// — ver jwt.strategy.ts) só aparecia como erro solto na tela que fez a
// chamada, sem tirar a pessoa da conta. Cobre login normal também.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error?.response?.status === 401 && typeof window !== 'undefined') {
            Cookies.remove('token');
            Cookies.remove('user');
            Cookies.remove('ftoken');

            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        // Teste grátis vencido: a API só libera /plans e /billing (ver
        // jwt.strategy.ts) e responde 403 TRIAL_EXPIRED no resto. Em vez de
        // deslogar, leva a pessoa direto pra tela de planos — é aí que o
        // teste vira cliente. Não redireciona de /planos nem do login/demo
        // pra não entrar em loop.
        if (
            error?.response?.status === 403 &&
            error?.response?.data?.code === 'TRIAL_EXPIRED' &&
            typeof window !== 'undefined'
        ) {
            const path = window.location.pathname;

            if (path !== '/planos' && path !== '/login' && path !== '/demo') {
                window.location.href = '/planos?motivo=teste-expirado';
            }
        }

        return Promise.reject(error);
    },
);

// Opções dos cookies de sessão: só HTTPS em produção e nunca enviados por
// outros sites.
export const opcoesCookie = (): Cookies.CookieAttributes => ({
    sameSite: 'strict',
    secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
});

// -----------------------------------------------------------------------------
// Arquivos (/uploads/...) exigem login. Links de <a href> e <img src> não
// mandam o header Authorization, então vão com um "token de arquivo" curto
// (12 h, só serve pra abrir arquivo — não dá acesso à API) no ?t=.
// -----------------------------------------------------------------------------
let buscandoTokenArquivo: Promise<void> | null = null;

export function garantirTokenArquivo() {
    if (typeof window === 'undefined' || !Cookies.get('token') || Cookies.get('ftoken')) return;
    buscandoTokenArquivo ??= api.get('/auth/arquivo-token')
        .then((r) => {
            // Guarda por 11 h (o token vale 12 h).
            Cookies.set('ftoken', r.data.token, { ...opcoesCookie(), expires: 11 / 24 });
        })
        .catch(() => undefined)
        .finally(() => { buscandoTokenArquivo = null; });
}

// URL de um arquivo do sistema (fileUrl, photoUrl...) já com o token.
export function arquivoUrl(caminho?: string | null): string {
    if (!caminho) return '#';
    if (/^(https?:|blob:|data:)/.test(caminho)) return caminho;
    garantirTokenArquivo();
    const token = Cookies.get('ftoken') || Cookies.get('token') || '';
    const url = `${API_URL}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
    return token ? `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}` : url;
}

if (typeof window !== 'undefined') garantirTokenArquivo();
