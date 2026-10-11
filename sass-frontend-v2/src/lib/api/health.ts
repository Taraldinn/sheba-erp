import { fetchApi } from './client';
import { API_BASE_URL } from './config';

export const healthApi = {
    readiness: () => fetch(`${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/healthz/`, { method: 'GET' }).then(r => r.json()),
    apiHealth: () => fetchApi<Record<string, unknown>>('/health-check/', { plane: 'tenant', skipAuth: true }),
};