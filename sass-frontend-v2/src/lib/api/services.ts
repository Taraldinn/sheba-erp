import { fetchApi, toQuery } from './client';
import type { CustomerService, PaginatedList } from './types';
import { asList } from './types';

export const serviceApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CustomerService>>(`/customer-services/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<CustomerService>(`/customer-services/${id}/`, { plane: 'tenant' }),
};