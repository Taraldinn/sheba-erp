import { fetchApi, toQuery } from './client';
import type { Customer, CustomerCreatePayload, PaginatedList } from './types';
import { asList } from './types';

export interface ListCustomersParams {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    billing_type?: string;
    has_due?: boolean | string;
    package?: string;
    router?: string;
    area_zone?: string;
    ordering?: string;
}

export const customerApi = {
    list: (params?: ListCustomersParams) =>
        fetchApi<PaginatedList<Customer>>(`/customers/${toQuery(params as Record<string, unknown>)}`, {
            plane: 'tenant',
        }).then(r => asList(r)),
    get: (id: string) => fetchApi<Customer>(`/customers/${id}/`, { plane: 'tenant' }),
    create: (data: CustomerCreatePayload) =>
        fetchApi<Customer>('/customers/', { method: 'POST', json: data, plane: 'tenant' }),
    update: (id: string, data: Partial<CustomerCreatePayload>) =>
        fetchApi<Customer>(`/customers/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    remove: (id: string) => fetchApi<void>(`/customers/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    checkUsername: (username: string) =>
        fetchApi<{ available: boolean; username: string }>(
            `/customers/check-username/?username=${encodeURIComponent(username)}`,
            { plane: 'tenant' }
        ),
};