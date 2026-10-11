import { fetchApi, toQuery } from './client';
import type {
    IspAdminOverview,
    IspAdminDomain,
    IspAdminModule,
    IspAdminModuleSubscription,
    IspAdminChildTenant,
    IspAdminChildTenantOverview,
    IspAdminChildAdminUser,
    IspAdminImpersonateResponse,
    IspAdminChildTenantCreatePayload,
    PaginatedList,
} from './types';
import { asList } from './types';

export const ispAdminApi = {
    getOverview: () => fetchApi<IspAdminOverview>('/admin/overview/', { plane: 'tenant' }),

    /* Domains */
    listDomains: () => fetchApi<PaginatedList<IspAdminDomain>>('/admin/domains/', { plane: 'tenant' }).then(r => asList(r)),
    createDomain: (data: Partial<IspAdminDomain>) =>
        fetchApi<IspAdminDomain>('/admin/domains/', { method: 'POST', json: data, plane: 'tenant' }),
    patchDomain: (id: string, data: Partial<IspAdminDomain>) =>
        fetchApi<IspAdminDomain>(`/admin/domains/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    verifyDomain: (id: string) => fetchApi<{ ok: boolean; verified_at?: string }>(`/admin/domains/${id}/verify/`, { method: 'POST', plane: 'tenant' }),
    deleteDomain: (id: string) => fetchApi<void>(`/admin/domains/${id}/`, { method: 'DELETE', plane: 'tenant' }),

    /* Modules */
    listModules: () => fetchApi<PaginatedList<IspAdminModule>>('/admin/modules/', { plane: 'tenant' }).then(r => asList(r)),
    getModuleSubscriptions: () => fetchApi<IspAdminModuleSubscription>('/admin/modules/subscriptions.json', { plane: 'tenant' }),
    subscribeModule: (feature_key: string) =>
        fetchApi<{ ok: boolean }>('/admin/modules/subscribe.json', { method: 'POST', json: { feature_key }, plane: 'tenant' }),
    unsubscribeModule: (feature_key: string) =>
        fetchApi<{ ok: boolean }>(`/admin/modules/${feature_key}/unsubscribe.json`, { method: 'POST', plane: 'tenant' }),

    /* Child tenants */
    listChildTenants: (params?: Record<string, string>) =>
        fetchApi<PaginatedList<IspAdminChildTenant>>(`/admin/child-tenants/${toQuery(params)}`, { plane: 'tenant' }).then(r => asList(r)),
    createChildTenant: (data: IspAdminChildTenantCreatePayload) =>
        fetchApi<IspAdminChildTenant>('/admin/child-tenants/', { method: 'POST', json: data, plane: 'tenant' }),
    patchChildTenant: (id: string, data: Partial<IspAdminChildTenant>) =>
        fetchApi<IspAdminChildTenant>(`/admin/child-tenants/${id}/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    softDeleteChildTenant: (id: string) => fetchApi<void>(`/admin/child-tenants/${id}/`, { method: 'DELETE', plane: 'tenant' }),
    getChildTenantOverview: (id: string) => fetchApi<IspAdminChildTenantOverview>(`/admin/child-tenants/${id}/overview.json`, { plane: 'tenant' }),
    listChildTenantDomains: (id: string) => fetchApi<IspAdminDomain[]>(`/admin/child-tenants/${id}/domains.json`, { plane: 'tenant' }),
    listChildTenantModules: (id: string) => fetchApi<IspAdminModuleSubscription>(`/admin/child-tenants/${id}/modules.json`, { plane: 'tenant' }),
    impersonateChildTenant: (id: string) => fetchApi<IspAdminImpersonateResponse>(`/admin/child-tenants/${id}/impersonate.json`, { method: 'POST', plane: 'tenant' }),
    getChildAdminUser: (id: string) => fetchApi<IspAdminChildAdminUser>(`/admin/child-tenants/${id}/admin-user/`, { plane: 'tenant' }),
    patchChildAdminUser: (id: string, data: Partial<IspAdminChildAdminUser>) =>
        fetchApi<IspAdminChildAdminUser>(`/admin/child-tenants/${id}/admin-user/`, { method: 'PATCH', json: data, plane: 'tenant' }),
    resetChildAdminPassword: (id: string, password: string) =>
        fetchApi<{ ok: boolean }>(`/admin/child-tenants/${id}/admin-user/reset-password.json`, { method: 'POST', json: { password }, plane: 'tenant' }),
    changeChildAdminEmail: (id: string, email: string) =>
        fetchApi<{ ok: boolean }>(`/admin/child-tenants/${id}/admin-user/change-email.json`, { method: 'POST', json: { email }, plane: 'tenant' }),
};