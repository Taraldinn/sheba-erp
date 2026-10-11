import { fetchApi, toQuery } from './client';
import type { Invoice, PaginatedList } from './types';
import { asList } from './types';

export const invoiceApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Invoice>>(`/invoices/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<Invoice>(`/invoices/${id}/`, { plane: 'tenant' }),
    create: (data: Partial<Invoice>) => fetchApi<Invoice>('/invoices/', { method: 'POST', json: data, plane: 'tenant' }),
};