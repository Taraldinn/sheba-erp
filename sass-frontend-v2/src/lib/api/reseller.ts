import { fetchApi, toQuery } from './client';
import { STORAGE_KEYS, storage } from './storage';
import { makeIdempotencyKey } from './idempotency';
import type {
    ResellerProfile,
    ResellerWallet,
    ResellerLedgerEntry,
    ResellerHold,
    ResellerCollection,
    ResellerCustomer,
    PaginatedList,
} from './types';
import { asList } from './types';

export interface ResellerPurchasePayload {
    customer_id: string;
    package_id: string;
    amount?: number;
}

export interface ResellerRenewPayload {
    subscription_id: string;
    amount?: number;
}

export interface ResellerCollectionPayload {
    customer_id: string;
    amount: number | string;
    method: string;
    reference?: string;
    note?: string;
}

export const resellerApi = {
    login: async (credentials: { username: string; password: string }) => {
        const res = await fetchApi<{ token: string; user?: any }>('/auth/reseller/login/', {
            method: 'POST',
            json: credentials,
            plane: 'tenant',
            tokenSlot: 'resellerToken',
        });
        if (res?.token && typeof window !== 'undefined') {
            storage.set(STORAGE_KEYS.resellerToken, res.token);
            if (res.user) storage.setJSON(STORAGE_KEYS.resellerUser, res.user);
        }
        return res;
    },
    logout: async () => {
        try {
            await fetchApi('/auth/logout/', { method: 'POST', plane: 'tenant', tokenSlot: 'resellerToken' });
        } catch {
            /* ignore */
        }
        if (typeof window !== 'undefined') {
            storage.remove(STORAGE_KEYS.resellerToken);
            storage.remove(STORAGE_KEYS.resellerUser);
        }
        return { success: true };
    },
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<ResellerProfile>>(`/resellers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    profile: () => fetchApi<ResellerProfile>('/resellers/me/', { plane: 'tenant', tokenSlot: 'resellerToken' }),
    get: (id: string) => fetchApi<ResellerProfile>(`/resellers/${id}/`, { plane: 'tenant' }),
    suspend: (id: string) => fetchApi<void>(`/resellers/${id}/suspend/`, { method: 'POST', plane: 'tenant' }),
    activate: (id: string) => fetchApi<void>(`/resellers/${id}/activate/`, { method: 'POST', plane: 'tenant' }),
    customers: (id: string, params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<ResellerCustomer>>(`/resellers/${id}/customers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    wallet: (id: string) => fetchApi<ResellerWallet>(`/resellers/${id}/wallet/`, { plane: 'tenant' }),
    ledger: (id: string, params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<ResellerLedgerEntry>>(`/resellers/${id}/ledger/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    holds: (id: string, status?: 'PENDING' | 'RELEASED' | 'CONSUMED' | 'EXPIRED') =>
        fetchApi<PaginatedList<ResellerHold>>(`/resellers/${id}/holds/${toQuery({ status })}`, { plane: 'tenant' }).then(r => asList(r)),
    releaseHold: (id: string, holdId: string) =>
        fetchApi<{ ok: boolean }>(`/resellers/${id}/holds/${holdId}/release/`, { method: 'POST', plane: 'tenant' }),
    credit: (id: string) => fetchApi<{ credit_limit: string; available_credit: string; outstanding: string }>(`/resellers/${id}/credit/`, { plane: 'tenant' }),
    purchase: (id: string, payload: ResellerPurchasePayload) =>
        fetchApi<{ ok: boolean; subscription_id: string; amount: string }>(`/resellers/${id}/purchase/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
            idempotencyKey: makeIdempotencyKey('reseller_purchase'),
        }),
    renew: (id: string, payload: ResellerRenewPayload) =>
        fetchApi<{ ok: boolean; subscription_id: string; amount: string }>(`/resellers/${id}/renew/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
            idempotencyKey: makeIdempotencyKey('reseller_renew'),
        }),
    collections: (id: string, params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<ResellerCollection>>(`/resellers/${id}/collections/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    recordCollection: (id: string, payload: ResellerCollectionPayload) =>
        fetchApi<ResellerCollection>(`/resellers/${id}/collections/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
            idempotencyKey: makeIdempotencyKey('reseller_collection'),
        }),
    allocateCollection: (id: string, collectionId: string, payload: { invoice_id?: string; subscription_id?: string }) =>
        fetchApi<{ ok: boolean }>(`/resellers/${id}/collections/${collectionId}/allocate/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
        }),
};

export const resellerRateApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<any>>(`/reseller-rates/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
