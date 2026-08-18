import axios from 'axios';
import Cookies from 'js-cookie';

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

    return config;
});