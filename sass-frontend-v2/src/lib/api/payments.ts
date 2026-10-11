import { fetchApi, toQuery } from './client';
import type { PaymentTransaction, PaginatedList } from './types';
import { asList } from './types';

export const paymentApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<PaymentTransaction>>(`/payments/transactions/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    get: (id: string) => fetchApi<PaymentTransaction>(`/payments/transactions/${id}/`, { plane: 'tenant' }),
};