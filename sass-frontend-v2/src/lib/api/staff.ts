/**
 * Tenant-plane Office Staff endpoints. Backed by `apps.authentication.*`
 * (the `staff` and `roles` routers under `/api/v1/`).
 */
import { fetchApi, toQuery } from './client';
import type { PaginatedList } from './types';
import { asList } from './types';

export interface OfficeStaffMember {
    id: string;
    user?: number;
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role?: string;
    role_display?: string;
    is_active: boolean;
    last_login?: string | null;
    created_at: string;
}

export const staffApi = {
    list: (params?: Record<string, unknown>) =>
        fetchApi<PaginatedList<OfficeStaffMember>>(`/staff/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
};
