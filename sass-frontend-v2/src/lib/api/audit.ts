/**
 * Tenant-plane Audit Log + Support Ticket endpoints. Backed by
 * `apps.core.views.AuditLogViewSet` and `apps.support.views.TicketViewSet`
 * (the `audit-logs` and `tickets` routers under `/api/v1/`).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface AuditLogEntry {
    id: string;
    actor_username?: string;
    action: string;
    module: string;
    resource_type?: string;
    resource_id?: string;
    details?: Record<string, unknown>;
    ip_address?: string;
    request_id?: string;
    created_at: string;
}

export interface Ticket {
    id: string;
    subject: string;
    description?: string;
    status: 'open' | 'in_progress' | 'pending' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    customer?: string;
    customer_name?: string;
    assignee?: string;
    assignee_name?: string;
    created_at: string;
    updated_at?: string;
}

export const auditApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<AuditLogEntry>>(`/audit-logs/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};

export const ticketApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<Ticket>>(`/tickets/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
