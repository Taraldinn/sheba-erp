import { fetchApi, toQuery } from './client';
import type { IspPackage, PaginatedList } from './types';
import { asList } from './types';

export const packageApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<IspPackage>>(`/packages/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<IspPackage>(`/packages/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<IspPackage>) => fetchApi<IspPackage>('/packages/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<IspPackage>) => fetchApi<IspPackage>(`/packages/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/packages/${id}/`, { method: 'DELETE', plane: 'tenant' }),
};