/**
 * Tenant-plane Store & Inventory endpoints. Backed by
 * `apps.store.*` (the `store-items` and `stock-transactions` routers
 * under `/api/v1/`).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface StoreItem {
    id: string;
    name: string;
    item_code?: string;
    category?: string;
    unit?: string;
    unit_price: number | string;
    stock_quantity?: number;
    is_active: boolean;
    description?: string;
    created_at: string;
}

export interface StockTransaction {
    id: string;
    item?: string;
    item_name?: string;
    quantity: number;
    direction: 'in' | 'out';
    reason: 'purchase' | 'sale' | 'deployment' | 'return' | 'damage' | 'adjustment';
    reference?: string;
    notes?: string;
    performed_by?: string;
    created_at: string;
}

export const storeApi = {
    items: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<StoreItem>>(`/store-items/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    transactions: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<StockTransaction>>(`/stock-transactions/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
