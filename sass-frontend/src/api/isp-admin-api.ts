/**
 * Phase 35 — ISP Owner Dashboard API client (extracted).
 *
 * Hits `/api/v1/admin/*` on the parent SaaS-subscriber tenant's hostname
 * (the ISP_ADMIN portal at ``app.example.xyz``). Re-uses the parent
 * tenant's DRF auth token via ``plane: 'tenant'`` (see api/client.ts).
 *
 * Endpoints mirror the backend matrix:
 *   GET  /admin/overview/
 *   *    /admin/domains/, /admin/domains/{id}/verify/
 *   *    /admin/modules/, /admin/modules/subscribe/,
 *        /admin/modules/subscriptions/, /admin/modules/{key}/unsubscribe/
 *   *    /admin/child-tenants/, /admin/child-tenants/{id}/{impersonate,overview,domains,modules}/
 *   *    /admin/child-tenants/{id}/admin-user/{,reset-password,change-email}/
 */
import { fetchApi } from './client';

export interface IspAdminOverview {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  subscription_status: string;
  subscription_expires_at: string | null;
  domain_count: number;
  verified_domain_count: number;
  enabled_modules_count: number;
  total_modules_count: number;
  staff_count: number;
  child_tenant_count: number;
  child_tenant_active_count: number;
  aggregate_subscriber_count: number;
}

export interface IspAdminDomain {
  id: string;
  hostname: string;
  domain_type: string;
  is_primary: boolean;
  is_active: boolean;
  verified: boolean;
  verified_at: string | null;
  verification_method: string | null;
  dns_challenge_token: string;
  created_at: string;
  updated_at: string;
}

export interface IspAdminModuleRow {
  key: string;
  label: string;
  category: string;
  paid: boolean;
  enabled: boolean;
  is_override: boolean;
  config: Record<string, unknown>;
}

export interface IspAdminModuleSubscription {
  tenant_id: string;
  features: IspAdminModuleRow[];
  overrides: Array<{
    feature_key: string;
    enabled: boolean;
    config: Record<string, unknown>;
    enabled_at: string | null;
    updated_at: string | null;
  }>;
}

export interface IspAdminChildTenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_status: string;
  plan: string;
  max_subscribers: number;
  max_routers: number;
  created_at: string;
  domain_count: number;
  customer_count: number;
  admin_username: string | null;
  admin_email: string | null;
}

export interface IspAdminChildTenantOverview {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  is_active: boolean;
  subscription_status: string;
  domain_count: number;
  enabled_modules_count: number;
  customer_count: number;
}

export interface IspAdminChildAdminUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  phone: string;
}

export interface IspAdminImpersonateResponse {
  token: string;
  tenant_slug: string;
  tenant_id: string;
  admin_username: string;
}

export type IspAdminChildTenantCreatePayload = {
  name: string;
  slug: string;
  admin_username: string;
  admin_password: string;
  domain?: string;
  admin_email?: string;
  admin_phone?: string;
  admin_first_name?: string;
  admin_last_name?: string;
};

const ADMIN_BASE = '/admin';

export const ispAdminApi = {
  // ── Overview ──────────────────────────────────────────────────────────
  getOverview: () =>
    fetchApi<IspAdminOverview>(`${ADMIN_BASE}/overview/`, { plane: 'tenant' }),

  // ── Domains ────────────────────────────────────────────────────────────
  listDomains: () =>
    fetchApi<IspAdminDomain[]>(`${ADMIN_BASE}/domains/`, { plane: 'tenant' })
      .then((res: unknown) => Array.isArray(res) ? (res as IspAdminDomain[]) : ((res as { results?: IspAdminDomain[] } | null | undefined)?.results ?? [])),

  createDomain: (payload: {
    hostname: string;
    domain_type?: string;
    is_primary?: boolean;
    is_active?: boolean;
  }) =>
    fetchApi<IspAdminDomain>(`${ADMIN_BASE}/domains/`, {
      method: 'POST',
      body: JSON.stringify(payload),
      plane: 'tenant',
    }),

  patchDomain: (id: string, payload: Partial<IspAdminDomain>) =>
    fetchApi<IspAdminDomain>(`${ADMIN_BASE}/domains/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      plane: 'tenant',
    }),

  deleteDomain: (id: string) =>
    fetchApi<void>(`${ADMIN_BASE}/domains/${id}/`, {
      method: 'DELETE',
      plane: 'tenant',
    }),

  verifyDomain: (id: string) =>
    fetchApi<{
      id: string;
      hostname: string;
      verified: boolean;
      verified_at: string | null;
      success: boolean;
      message: string;
    }>(`${ADMIN_BASE}/domains/${id}/verify/`, {
      method: 'POST',
      plane: 'tenant',
    }),

  // ── Modules ────────────────────────────────────────────────────────────
  listModules: () =>
    fetchApi<IspAdminModuleRow[]>(`${ADMIN_BASE}/modules/`, {
      plane: 'tenant',
    }),

  getModuleSubscriptions: () =>
    fetchApi<IspAdminModuleSubscription>(
      `${ADMIN_BASE}/modules/subscriptions/`,
      { plane: 'tenant' },
    ),

  subscribeModule: (feature_key: string, config: Record<string, unknown> = {}) =>
    fetchApi<{
      feature_key: string;
      enabled: boolean;
      config: Record<string, unknown>;
      updated_at: string;
    }>(`${ADMIN_BASE}/modules/subscribe/`, {
      method: 'POST',
      body: JSON.stringify({ feature_key, enabled: true, config }),
      plane: 'tenant',
    }),

  unsubscribeModule: (feature_key: string) =>
    fetchApi<{ feature_key: string; unsubscribed: boolean }>(
      `${ADMIN_BASE}/modules/${encodeURIComponent(feature_key)}/unsubscribe/`,
      { method: 'POST', plane: 'tenant' },
    ),

  // ── Child tenants ──────────────────────────────────────────────────────
  listChildTenants: () =>
    fetchApi<IspAdminChildTenant[]>(`${ADMIN_BASE}/child-tenants/`, {
      plane: 'tenant',
    }),

  createChildTenant: (payload: IspAdminChildTenantCreatePayload) =>
    fetchApi<IspAdminChildTenant>(`${ADMIN_BASE}/child-tenants/`, {
      method: 'POST',
      body: JSON.stringify(payload),
      plane: 'tenant',
    }),

  patchChildTenant: (
    id: string,
    payload: Partial<{
      name: string;
      is_active: boolean;
      notes: string;
      contact_email: string;
      contact_phone: string;
      address: string;
      max_subscribers: number;
      max_routers: number;
    }>,
  ) =>
    fetchApi<IspAdminChildTenant>(`${ADMIN_BASE}/child-tenants/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      plane: 'tenant',
    }),

  softDeleteChildTenant: (id: string) =>
    fetchApi<void>(`${ADMIN_BASE}/child-tenants/${id}/`, {
      method: 'DELETE',
      plane: 'tenant',
    }),

  getChildTenantOverview: (id: string) =>
    fetchApi<IspAdminChildTenantOverview>(
      `${ADMIN_BASE}/child-tenants/${id}/overview/`,
      { plane: 'tenant' },
    ),

  listChildTenantDomains: (id: string) =>
    fetchApi<IspAdminDomain[]>(
      `${ADMIN_BASE}/child-tenants/${id}/domains/`,
      { plane: 'tenant' },
    ).then((res: unknown) => Array.isArray(res) ? (res as IspAdminDomain[]) : ((res as { results?: IspAdminDomain[] } | null | undefined)?.results ?? [])),

  listChildTenantModules: (id: string) =>
    fetchApi<{ features: IspAdminModuleRow[] }>(
      `${ADMIN_BASE}/child-tenants/${id}/modules/`,
      { plane: 'tenant' },
    ),

  impersonateChildTenant: (id: string) =>
    fetchApi<IspAdminImpersonateResponse>(
      `${ADMIN_BASE}/child-tenants/${id}/impersonate/`,
      { method: 'POST', plane: 'tenant' },
    ),

  // ── Child admin user ───────────────────────────────────────────────────
  getChildAdminUser: (id: string) =>
    fetchApi<IspAdminChildAdminUser>(
      `${ADMIN_BASE}/child-tenants/${id}/admin-user/`,
      { plane: 'tenant' },
    ),

  patchChildAdminUser: (
    id: string,
    payload: Partial<{
      email: string;
      first_name: string;
      last_name: string;
      is_active: boolean;
      phone: string;
    }>,
  ) =>
    fetchApi<IspAdminChildAdminUser>(
      `${ADMIN_BASE}/child-tenants/${id}/admin-user/`,
      { method: 'PATCH', body: JSON.stringify(payload), plane: 'tenant' },
    ),

  resetChildAdminPassword: (id: string, new_password: string) =>
    fetchApi<{ detail: string; user_id: number; username: string }>(
      `${ADMIN_BASE}/child-tenants/${id}/admin-user/reset-password/`,
      { method: 'POST', body: JSON.stringify({ new_password }), plane: 'tenant' },
    ),

  changeChildAdminEmail: (id: string, new_email: string) =>
    fetchApi<{ user_id: number; new_email: string }>(
      `${ADMIN_BASE}/child-tenants/${id}/admin-user/change-email/`,
      { method: 'POST', body: JSON.stringify({ new_email }), plane: 'tenant' },
    ),
};