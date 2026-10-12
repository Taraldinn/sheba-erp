/**
 * Tenant-plane Corporate Clients endpoints. Backed by `apps.corporate.*`
 * (mounted under `/api/v1/corporate/` in the backend).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface CorporateCustomer {
    id: string;
    name: string;
    code?: string;
    industry?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    address?: string;
    status: 'active' | 'inactive' | 'suspended';
    contract_start?: string;
    contract_end?: string;
    created_at: string;
}

export interface CorporateConnection {
    id: string;
    customer?: string;
    customer_name?: string;
    service_identifier?: string;
    bandwidth_down?: number;
    bandwidth_up?: number;
    vlan?: string;
    ip_pool?: string;
    status: 'active' | 'inactive' | 'suspended';
    installed_at?: string;
    created_at: string;
}

export interface CorporateIPPool {
    id: string;
    name: string;
    cidr: string;
    gateway?: string;
    vlan?: string;
    total_addresses: number;
    used_addresses: number;
    is_active: boolean;
}

export interface CorporateVLAN {
    id: string;
    vlan_id: number;
    name: string;
    description?: string;
    customer?: string;
    customer_name?: string;
    is_active: boolean;
}

export const corporateApi = {
    customers: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CorporateCustomer>>(`/corporate/customers/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    connections: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CorporateConnection>>(`/corporate/connections/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    ipPools: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CorporateIPPool>>(`/corporate/ip-pools/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    vlans: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<CorporateVLAN>>(`/corporate/vlans/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
