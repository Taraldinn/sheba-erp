import { fetchApi, toQuery } from './client';
import type { CustomerSubscription, PaginatedList } from './types';
import { asList } from './types';

export const subscriptionApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CustomerSubscription>>(`/customer-subscriptions/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<CustomerSubscription>(`/customer-subscriptions/${id}/`, { plane: 'tenant' }),
    activate: (id: string) => fetchApi<CustomerSubscription>(`/customer-subscriptions/${id}/activate/`, { method: 'POST', plane: 'tenant' }),
    suspend: (id: string) => fetchApi<CustomerSubscription>(`/customer-subscriptions/${id}/suspend/`, { method: 'POST', plane: 'tenant' }),
    terminate: (id: string) => fetchApi<CustomerSubscription>(`/customer-subscriptions/${id}/terminate/`, { method: 'POST', plane: 'tenant' }),
};