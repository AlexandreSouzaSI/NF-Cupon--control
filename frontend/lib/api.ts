import axios from 'axios';
import Cookies from 'js-cookie';

export const API_URL = 'http://localhost:3000';

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