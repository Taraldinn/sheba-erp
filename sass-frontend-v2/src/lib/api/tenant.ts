import { fetchApi, toQuery } from './client';
import { STORAGE_KEYS, storage } from './storage';
import type {
    TenantLoginResponse,
    IspAdminTenant,
    TenantResolveResponse,
    PaginatedList,
    TenantCredentials,
    TenantAccountItem,
    CreateTenantAccountPayload,
    TenantRoleItem,
    CreateTenantRolePayload,
    TenantPermissionItem,
    AutoLoginResponse,
} from './types';
import { asList } from './types';

export const tenantApi = {
    login: async (credentials: { username: string; password: string; tenant?: string }): Promise<TenantLoginResponse> => {
        const payload: Record<string, string> = { username: credentials.username, password: credentials.password };
        if (credentials.tenant) payload.tenant = credentials.tenant;
        const res = await fetchApi<TenantLoginResponse>('/auth/login', { method: 'POST', json: payload, plane: 'tenant' });
        const token = res?.token || res?.session_token;
        if (token && typeof window !== 'undefined') {
            storage.set(STORAGE_KEYS.tenantToken, token);
            if (res.user) storage.setJSON(STORAGE_KEYS.tenantUser, res.user);
            if (res.tenant?.slug) storage.set(STORAGE_KEYS.tenantSlug, res.tenant.slug);
            if (res.tenant?.id) storage.set(STORAGE_KEYS.tenantId, res.tenant.id);
        }
        return res;
    },
    logout: async () => {
        try {
            await fetchApi('/auth/logout', { method: 'POST', plane: 'tenant' });
        } catch {
            /* ignore */
        }
        if (typeof window !== 'undefined') {
            storage.remove(STORAGE_KEYS.tenantToken);
            storage.remove(STORAGE_KEYS.tenantUser);
            storage.remove(STORAGE_KEYS.tenantSlug);
            storage.remove(STORAGE_KEYS.tenantId);
        }
        return { success: true };
    },
    me: async () => {
        try {
            const res = await fetchApi<any>('/auth/me', { plane: 'tenant' });
            if (res && typeof window !== 'undefined') storage.setJSON(STORAGE_KEYS.tenantUser, res);
            return res;
        } catch (e) {
            if (typeof window === 'undefined') return null;
            const raw = storage.get(STORAGE_KEYS.tenantUser);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        }
    },
    changePassword: (current_password: string, new_password: string) =>
        fetchApi<{ message: string; token: string }>('/auth/change-password', {
            method: 'POST',
            json: { current_password, new_password },
            plane: 'tenant',
        }),
    requestPasswordReset: (email: string, tenant?: string) =>
        fetchApi<{ detail: string }>('/auth/password-reset', {
            method: 'POST',
            json: { email, ...(tenant ? { tenant } : {}) },
            plane: 'tenant',
        }),
    confirmPasswordReset: (uid: string, token: string, new_password: string) =>
        fetchApi<{ detail: string }>('/auth/password-reset-confirm', {
            method: 'POST',
            json: { uid, token, new_password },
            plane: 'tenant',
        }),
    myTenants: () =>
        fetchApi<{ count: number; items: IspAdminTenant[]; is_isp_admin: boolean }>('/auth/my-tenants/', { plane: 'tenant' }).catch(() => ({
            count: 0,
            items: [],
            is_isp_admin: false,
        })),
    resolveBySlug: (slugOrDomain: string) =>
        fetchApi<TenantResolveResponse>(`/tenants/resolve/${encodeURIComponent(slugOrDomain)}/`, {
            skipAuth: true,
            plane: 'tenant',
        }),
    features: () => fetchApi<Record<string, unknown>>('/features/me/', { plane: 'tenant' }),
    submitTenantRequest: (data: any) =>
        fetchApi<{ message: string; request_id: string; status: string }>('/auth/my-tenants/request/', {
            method: 'POST',
            json: data,
            plane: 'tenant',
        }),
    getMyTenantRequests: () =>
        fetchApi<{ count: number; items: any[] }>('/auth/my-tenants/requests/', {
            plane: 'tenant',
        }).catch(() => ({ count: 0, items: [] })),
    getTenantCredentials: (tenantId: string) =>
        fetchApi<TenantCredentials>(`/auth/my-tenants/${tenantId}/credentials/`, { plane: 'tenant' }),
    setTenantPassword: (tenantId: string, payload: { new_password: string; user_id?: number }) =>
        fetchApi<{ message: string; username: string; token: string }>(`/auth/my-tenants/${tenantId}/set-password/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
        }),
    getAutoLoginToken: (tenantId: string) =>
        fetchApi<AutoLoginResponse>(`/auth/my-tenants/${tenantId}/auto-login-token/`, {
            method: 'POST',
            plane: 'tenant',
        }),
    getTenantAccounts: (tenantId: string) =>
        fetchApi<{ count: number; items: TenantAccountItem[] }>(`/auth/my-tenants/${tenantId}/accounts/`, {
            plane: 'tenant',
        }),
    createTenantAccount: (tenantId: string, payload: CreateTenantAccountPayload) =>
        fetchApi<{ message: string; user_id: number; username: string; role: string }>(`/auth/my-tenants/${tenantId}/accounts/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
        }),
    resetAccountPassword: (tenantId: string, userId: number, payload: { new_password: string }) =>
        fetchApi<{ message: string; token: string }>(`/auth/my-tenants/${tenantId}/accounts/${userId}/reset-password/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
        }),
    getTenantRoles: (tenantId: string) =>
        fetchApi<{ count: number; items: TenantRoleItem[] }>(`/auth/my-tenants/${tenantId}/roles/`, {
            plane: 'tenant',
        }),
    createTenantRole: (tenantId: string, payload: CreateTenantRolePayload) =>
        fetchApi<{ message: string; role_id: string; name: string }>(`/auth/my-tenants/${tenantId}/roles/`, {
            method: 'POST',
            json: payload,
            plane: 'tenant',
        }),
    getTenantPermissions: () =>
        fetchApi<{ count: number; items: TenantPermissionItem[] }>('/auth/my-tenants/permissions/', {
            plane: 'tenant',
        }),
};