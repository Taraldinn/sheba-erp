import { fetchApi, toQuery } from './client';
import type { Router, NetworkProfile, PPPoEAccount, Olt, PaginatedList } from './types';
import { asList } from './types';

export const routerApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Router>>(`/routers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Router>(`/routers/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Router>) => fetchApi<Router>('/routers/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<Router>) => fetchApi<Router>(`/routers/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/routers/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    syncNow: (id: string) => fetchApi<{ ok: boolean; job_id?: string }>(`/network/usage/sync/`, { method: 'POST', json: { router_id: id }, plane: 'tenant' }),
    test: (id: string) => fetchApi<{ ok: boolean; latency_ms?: number }>(`/routers/${id}/test-connection/`, { method: 'POST', plane: 'tenant' }),
};

export const networkProfileApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<NetworkProfile>>(`/network/profiles/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

export const pppoeAccountApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PPPoEAccount>>(`/network/pppoe/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

export const oltApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Olt>>(`/olts/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Olt>(`/olts/${id}/`, { plane: 'tenant' }),
};
