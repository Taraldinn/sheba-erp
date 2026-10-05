import {
  Tenant, Domain, OnboardingRequest, Package,
  Subscription, Payment, Backup, AuditLog, DashboardOverview,
  TenantTelemetry, TenantFeatureFlag, TenantAdmin, ImpersonateResult,
  FeatureMatrixResponse, SaaSPlatformHealth, SaaSEmployee
} from './types';
import { detectPlane, effectivePlane } from '@/lib/plane';

// ── Base URL resolution ────────────────────────────────────────────────────
const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const CLEAN_API_URL = RAW_API_URL.replace(/\/+$/, '');
export const API_BASE_URL = CLEAN_API_URL;
export const SAAS_API_BASE_URL = CLEAN_API_URL.endsWith('/saas') ? CLEAN_API_URL : `${CLEAN_API_URL}/saas`;

export const DEFAULT_DEV_TOKEN = 'ec16823ff18955180c239c58c6bd5707113dd856';
export const DEFAULT_DEV_USERNAME = 'admin';
export const DEFAULT_DEV_PASSWORD = 'admin123';

export const STORAGE_KEYS = {
  centralToken: 'saas_central_token',
  centralUser: 'saas_central_user',
  tenantToken: 'saas_tenant_token',
  tenantUser: 'saas_tenant_user',
  tenantSlug: 'saas_tenant_slug',
  tenantId: 'saas_tenant_id',
  bootstrapPending: 'saas_bootstrap_pending',
} as const;

export type Plane = 'central' | 'tenant';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getActivePlane(): Plane { return effectivePlane().plane; }
function getStorageKey(plane: Plane) { return plane === 'central' ? STORAGE_KEYS.centralToken : STORAGE_KEYS.tenantToken; }
function getUserStorageKey(plane: Plane) { return plane === 'central' ? STORAGE_KEYS.centralUser : STORAGE_KEYS.tenantUser; }
function getApiBaseUrl(plane: Plane): string { return plane === 'central' ? SAAS_API_BASE_URL : API_BASE_URL; }

// ── Normalizers ────────────────────────────────────────────────────────────

function normalizeOverview(raw: any): DashboardOverview {
  const kpis = raw?.kpis || {};
  const financial = raw?.financial || {};
  const backups = raw?.backups || {};
  const platform = raw?.platform || {};
  return {
    total_tenants: kpis.total_tenants ?? raw.total_tenants ?? 0,
    active_subscriptions: kpis.active_tenants ?? raw.active_subscriptions ?? 0,
    mrr: financial.monthly_recurring_revenue ?? kpis.platform_mrr ?? raw.mrr ?? 0,
    pending_onboarding: kpis.pending_requests ?? raw.pending_onboarding ?? 0,
    total_revenue: financial.total_revenue_collected ?? raw.total_revenue ?? 0,
    storage_used_bytes: backups.total_storage_mb ? backups.total_storage_mb * 1024 * 1024 : (raw.storage_used_bytes ?? 0),
    system_health: (platform.system_status?.toLowerCase().includes('healthy') ? 'healthy' : 'warning') as any,
  };
}

function normalizeTenant(t: any): Tenant {
  const schema = t.schema_name || t.slug || '';
  const domainUrl = t.domain_url || t.primary_domain || t.domain || `${schema || 'app'}.shebafi.xyz`;
  return {
    id: String(t.id), name: t.name || '', schema_name: schema, domain_url: domainUrl,
    plan: t.plan || 'Growth ISP Tier', contact_email: t.contact_email || '',
    contact_phone: t.contact_phone || '', address: t.address || '',
    is_active: Boolean(t.is_active),
    created_at: t.created_at || new Date().toISOString(),
    updated_at: t.updated_at || new Date().toISOString(),
  };
}

function normalizeDomain(d: any): Domain {
  return {
    id: String(d.id), domain: d.domain || d.hostname || '',
    tenant_id: String(d.tenant_id || d.tenant || ''),
    tenant_name: d.tenant_name || d.tenant_slug || '',
    is_primary: Boolean(d.is_primary),
    is_active: Boolean(d.is_active !== undefined ? d.is_active : d.verified),
    ssl_active: Boolean(d.ssl_active !== undefined ? d.ssl_active : d.verified),
    created_at: d.created_at || new Date().toISOString(),
  };
}

function normalizeOnboardingRequest(r: any): OnboardingRequest {
  return {
    id: String(r.id), company_name: r.organization_name || r.company_name || '',
    email: r.contact_email || r.email || '', phone: r.contact_phone || r.phone || '',
    plan_requested: r.requested_plan || r.plan_requested || 'Starter ISP Tier',
    notes: r.notes || r.admin_notes || '',
    status: (r.status || 'pending').toLowerCase() as any,
    created_at: r.created_at || new Date().toISOString(),
  };
}

function normalizePackage(p: any): Package {
  let features = p.features || [];
  if (typeof features === 'string') { try { features = JSON.parse(features); } catch { features = [features]; } }
  return {
    id: String(p.id), name: p.name || '', price: Number(p.monthly_price ?? p.price ?? 0),
    currency: p.currency || 'USD', billing_interval: p.billing_interval || 'monthly',
    features: Array.isArray(features) ? features : [],
    is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
    subscriber_count: p.subscriber_count ?? p.subscribers_enrolled ?? 0,
  };
}

function normalizeSubscription(s: any): Subscription {
  return {
    id: String(s.id), tenant_id: String(s.tenant_id || s.tenant || ''),
    tenant_name: s.tenant_name || s.tenant_slug || '',
    package_id: String(s.package_id || s.package || ''),
    package_name: s.package_name || 'Standard Tier',
    status: (s.status === 'cancelled' ? 'canceled' : s.status || 'active').toLowerCase() as any,
    current_period_end: s.end_date || s.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
    created_at: s.created_at || new Date().toISOString(),
  };
}

function normalizePayment(p: any): Payment {
  const st = (p.status || '').toLowerCase();
  let mappedStatus: 'succeeded' | 'pending' | 'failed' | 'refunded' = 'succeeded';
  if (st.includes('completed') || st.includes('succeeded') || st.includes('success')) mappedStatus = 'succeeded';
  else if (st.includes('refund')) mappedStatus = 'refunded';
  else if (st.includes('fail')) mappedStatus = 'failed';
  else if (st.includes('pend')) mappedStatus = 'pending';
  return {
    id: String(p.id || p.trx_id || ''), subscription_id: String(p.subscription_id || p.subscription || ''),
    tenant_name: p.tenant_name || '', amount: Number(p.amount || 0), currency: p.currency || 'USD',
    payment_method: p.payment_method || 'bKash / MFS', status: mappedStatus,
    created_at: p.paid_at || p.created_at || new Date().toISOString(),
  };
}

function normalizeBackup(b: any): Backup {
  let bt: 'full' | 'database' | 'media' = 'full';
  if (b.backup_type === 'database_only' || b.backup_type === 'database') bt = 'database';
  else if (b.backup_type?.includes('media')) bt = 'media';
  return {
    id: String(b.id || b.backup_name || ''),
    tenant_id: String(b.tenant || b.tenant_id || 'Global Platform'),
    tenant_name: b.tenant_name || b.backup_name || 'All Tenants',
    backup_type: bt,
    status: (b.status === 'completed' ? 'completed' : (b.status === 'failed' ? 'failed' : 'in_progress')),
    size_bytes: Number(b.file_size_bytes || b.size_bytes || 0),
    created_at: b.created_at || new Date().toISOString(),
  };
}

function normalizeAuditLog(l: any): AuditLog {
  return {
    id: String(l.id), action: l.action || 'system.event',
    user_id: l.actor_username || l.user_id || 'admin@sheba.app',
    tenant_id: l.tenant_name || l.tenant_slug || (l.tenant ? String(l.tenant) : undefined),
    details: typeof l.details === 'object' && l.details !== null ? l.details : { info: l.details || '' },
    ip_address: l.ip_address || '127.0.0.1',
    created_at: l.timestamp || l.created_at || new Date().toISOString(),
  };
}

function normalizeEmployee(e: any): SaaSEmployee {
  return {
    id: e.id, worker_id: e.worker_id || e.employee_code || `#EMP-${e.id}`,
    employee_code: e.employee_code, full_name: e.full_name || '', email: e.email || '',
    phone: e.phone || '', role: e.role || e.designation || 'Staff',
    designation: e.designation, worker_type: e.worker_type || 'Employee',
    department: e.department || 'Operations',
    is_active: e.is_active !== undefined ? Boolean(e.is_active) : true,
    joining_date: e.joining_date, basic_salary: Number(e.basic_salary || 0),
    created_at: e.created_at, tenant: e.tenant, tenant_name: e.tenant_name,
  };
}

function extractList<T>(res: any, mapper: (raw: any) => T): T[] {
  if (Array.isArray(res)) return res.map(mapper);
  if (res && Array.isArray(res.results)) return res.results.map(mapper);
  return [];
}

// ── Network fetcher ────────────────────────────────────────────────────────

async function refreshDefaultToken(plane: Plane): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const url = plane === 'central' ? `${SAAS_API_BASE_URL}/auth/login/` : `${API_BASE_URL}/auth/login/`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username: DEFAULT_DEV_USERNAME, password: DEFAULT_DEV_PASSWORD }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (data && data.token) {
      localStorage.setItem(getStorageKey(plane), data.token);
      if (data.user) localStorage.setItem(getUserStorageKey(plane), JSON.stringify(data.user));
      return data.token;
    }
  } catch { /* ignore */ }
  return null;
}

interface FetchOptions extends RequestInit {
  plane?: Plane;
  skipAuth?: boolean;
  tenantSlug?: string;
}

async function fetchApi<T>(endpoint: string, opts: FetchOptions = {}): Promise<T> {
  const plane = opts.plane || getActivePlane();
  const baseUrl = getApiBaseUrl(plane);
  const storageKey = getStorageKey(plane);

  let token = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
  if (!token || token.startsWith('mock_') || token.length < 30) {
    token = plane === 'central' ? DEFAULT_DEV_TOKEN : null;
    if (token && typeof window !== 'undefined') localStorage.setItem(storageKey, token);
  }

  const hasQuery = endpoint.includes('?');
  let normalizedEndpoint: string;
  if (hasQuery) {
    const [path, query] = endpoint.split('?');
    const cleanPath = path.endsWith('/') ? path : `${path}/`;
    normalizedEndpoint = `${cleanPath}?${query}`;
  } else {
    normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  }

  const fullUrl = `${baseUrl}${normalizedEndpoint}`;

  const stripAuth =
    normalizedEndpoint.startsWith('/auth/login') ||
    normalizedEndpoint.startsWith('/auth/logout') ||
    normalizedEndpoint.startsWith('/auth/password-reset') ||
    normalizedEndpoint.startsWith('/tenants/resolve') ||
    opts.skipAuth === true;

  const buildHeaders = (authToken: string | null): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (authToken && !stripAuth) {
      h['Authorization'] = authToken.startsWith('Token ') || authToken.startsWith('Bearer ') ? authToken : `Token ${authToken}`;
    }
    const currentTenant = opts.tenantSlug || (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.tenantSlug) : null);
    if (currentTenant && plane === 'tenant') {
      h['X-Tenant-ID'] = currentTenant;
    }
    return h;
  };

  let response: Response;
  try {
    response = await fetch(fullUrl, { ...opts, headers: { ...buildHeaders(token), ...opts?.headers } });
  } catch (networkError: any) {
    throw new ApiError(0, `Cannot connect to backend at ${fullUrl}: ${networkError?.message || 'Network unreachable'}`);
  }

  if (response.status === 401 && !stripAuth) {
    const fresh = await refreshDefaultToken(plane);
    if (fresh) {
      token = fresh;
      try {
        response = await fetch(fullUrl, { ...opts, headers: { ...buildHeaders(token), ...opts?.headers } });
      } catch (networkError: any) {
        throw new ApiError(0, `Cannot connect to backend at ${fullUrl}: ${networkError?.message || 'Network unreachable'}`);
      }
    }
  }

  if (response.status === 204) return {} as T;

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.error || errorData.message || JSON.stringify(errorData);
      } else { errorMsg = await response.text(); }
    } catch { /* ignore */ }
    throw new ApiError(response.status, errorMsg);
  }

  if (contentType.includes('text/html')) {
    throw new ApiError(response.status, 'Received HTML response instead of JSON from backend');
  }
  return await response.json();
}

// ── Public API surfaces ────────────────────────────────────────────────────

export const saasApi = {
  login: async (credentials: { username?: string; email?: string; password: string }) => {
    const payload = { username: credentials.username || credentials.email, password: credentials.password };
    const res = await fetchApi<{ token: string; user?: any; session_token?: string; message?: string }>(
      '/auth/login', { method: 'POST', body: JSON.stringify(payload), plane: 'central' }
    );
    if (res && res.token && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.centralToken, res.token);
      if (res.user) localStorage.setItem(STORAGE_KEYS.centralUser, JSON.stringify(res.user));
    }
    return res;
  },
  me: async () => fetchApi<any>('/auth/me', { plane: 'central' }).then((res) => ({
    email: res.email || 'admin@sheba.local',
    name: res.username || res.name || res.full_name || 'System Administrator',
    role: res.role || 'Platform Super Admin', ...res,
  })),
  logout: async () => {
    try { await fetchApi('/auth/logout', { method: 'POST', plane: 'central' }); } catch { /* ignore */ }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.centralToken);
      localStorage.removeItem(STORAGE_KEYS.centralUser);
    }
    return { success: true };
  },

  getDashboardOverview: () => fetchApi<any>('/overview', { plane: 'central' }).then(normalizeOverview),
  getTenants: () => fetchApi<any>('/tenants', { plane: 'central' }).then((r) => extractList(r, normalizeTenant)),
  getTenant: (id: string) => fetchApi<any>(`/tenants/${id}`, { plane: 'central' }).then(normalizeTenant),

  createTenant: (data: Partial<Tenant>) => {
    const slug = data.schema_name || (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const payload: Record<string, any> = {
      name: data.name, slug,
      domain: data.domain_url || `${slug}.shebafi.xyz`, plan: data.plan || 'Growth ISP Tier',
    };
    if (data.contact_email) payload.contact_email = data.contact_email;
    if (data.contact_phone) payload.contact_phone = data.contact_phone;
    if (data.address) payload.address = data.address;
    if (data.is_active !== undefined) payload.is_active = data.is_active;
    return fetchApi<any>('/tenants', { method: 'POST', body: JSON.stringify(payload), plane: 'central' }).then(normalizeTenant);
  },
  updateTenant: (id: string, data: Partial<Tenant>) => {
    const payload: Record<string, any> = { ...data };
    if (data.schema_name) payload.slug = data.schema_name;
    if (data.domain_url) payload.domain = data.domain_url;
    return fetchApi<any>(`/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(payload), plane: 'central' }).then(normalizeTenant);
  },
  toggleTenantStatus: (id: string) => fetchApi<any>(`/tenants/${id}/toggle-status`, { method: 'POST', plane: 'central' }).then(normalizeTenant),
  deleteTenant: (id: string) => fetchApi<void>(`/tenants/${id}`, { method: 'DELETE', plane: 'central' }),

  getTenantBySlug: async (slug: string): Promise<Tenant | null> => {
    try {
      const list = await fetchApi<any>(`/tenants?search=${encodeURIComponent(slug)}`, { plane: 'central' })
        .then((r) => extractList(r, normalizeTenant));
      return list.find((t) => t.schema_name === slug) || list[0] || null;
    } catch { return null; }
  },

  getTenantTelemetry: (id: string) => fetchApi<TenantTelemetry>(`/tenants/${id}/telemetry`, { plane: 'central' }),
  getTenantFeatures: (id: string) => fetchApi<{ tenant: string; features: TenantFeatureFlag[] }>(`/tenants/${id}/features`, { plane: 'central' }),
  updateTenantFeature: (id: string, feature_key: string, enabled: boolean, config?: Record<string, any>) =>
    fetchApi<{ message: string; feature_key: string; enabled: boolean }>(
      `/tenants/${id}/features`, { method: 'POST', body: JSON.stringify({ feature_key, enabled, config: config || {} }), plane: 'central' }
    ),
  impersonateTenant: (id: string) => fetchApi<ImpersonateResult>(`/tenants/${id}/impersonate`, { method: 'POST', plane: 'central' }),
  getTenantAdmins: (id: string) => fetchApi<TenantAdmin[]>(`/tenants/${id}/admins`, { plane: 'central' }),
  createTenantAdmin: (id: string, data: { username: string; password?: string; email?: string; phone?: string; first_name?: string; last_name?: string }) =>
    fetchApi<TenantAdmin>(`/tenants/${id}/create-admin`, { method: 'POST', body: JSON.stringify(data), plane: 'central' }),

  bulkSuspend: (tenant_ids: string[]) => fetchApi<{ succeeded: any[]; failed: any[]; count: number }>('/tenants/bulk-suspend', { method: 'POST', body: JSON.stringify({ tenant_ids }), plane: 'central' }),
  bulkActivate: (tenant_ids: string[]) => fetchApi<{ succeeded: any[]; failed: any[]; count: number }>('/tenants/bulk-activate', { method: 'POST', body: JSON.stringify({ tenant_ids }), plane: 'central' }),
  bulkDelete: (tenant_ids: string[]) => fetchApi<{ succeeded: any[]; failed: any[]; count: number }>('/tenants/bulk-delete', { method: 'POST', body: JSON.stringify({ tenant_ids }), plane: 'central' }),

  getDomains: () => fetchApi<any>('/domains', { plane: 'central' }).then((r) => extractList(r, normalizeDomain)),
  createDomain: (data: Partial<Domain>) => fetchApi<any>('/domains', { method: 'POST', body: JSON.stringify({ hostname: data.domain, tenant: data.tenant_id, is_primary: data.is_primary ?? false, is_active: data.is_active ?? true }), plane: 'central' }).then(normalizeDomain),
  verifyDomain: (id: string) => fetchApi<any>(`/domains/${id}/toggle-verify`, { method: 'POST', plane: 'central' }).then(normalizeDomain),
  setPrimaryDomain: (id: string) => fetchApi<any>(`/domains/${id}`, { method: 'PATCH', body: JSON.stringify({ is_primary: true }), plane: 'central' }).then(normalizeDomain),
  deleteDomain: (id: string) => fetchApi<void>(`/domains/${id}`, { method: 'DELETE', plane: 'central' }),

  getOnboardingRequests: () => fetchApi<any>('/requests', { plane: 'central' }).then((r) => extractList(r, normalizeOnboardingRequest)),
  createOnboardingRequest: (data: Partial<OnboardingRequest> & Record<string, any>) =>
    fetchApi<any>('/requests', { method: 'POST', body: JSON.stringify(data), plane: 'central' }).then(normalizeOnboardingRequest),
  approveOnboarding: (id: string) => fetchApi<any>(`/requests/${id}/approve`, { method: 'POST', plane: 'central' }).then((res) => normalizeTenant(res?.tenant || res)),
  rejectOnboarding: (id: string, reason?: string) => fetchApi<void>(`/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: reason || 'Application rejected by platform administrator.' }), plane: 'central' }),

  getPackages: () => fetchApi<any>('/packages', { plane: 'central' }).then((r) => extractList(r, normalizePackage)),
  createPackage: (data: Partial<Package>) => {
    const payload = {
      name: data.name, code: (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || `pkg-${Date.now()}`,
      monthly_price: data.price, yearly_price: (data.price || 0) * 10,
      features: data.features || [], is_active: data.is_active !== undefined ? data.is_active : true,
    };
    return fetchApi<any>('/packages', { method: 'POST', body: JSON.stringify(payload), plane: 'central' }).then(normalizePackage);
  },
  updatePackage: (id: string, data: Partial<Package>) => {
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.price !== undefined) payload.monthly_price = data.price;
    if (data.features !== undefined) payload.features = data.features;
    if (data.is_active !== undefined) payload.is_active = data.is_active;
    return fetchApi<any>(`/packages/${id}`, { method: 'PATCH', body: JSON.stringify(payload), plane: 'central' }).then(normalizePackage);
  },
  deletePackage: (id: string) => fetchApi<void>(`/packages/${id}`, { method: 'DELETE', plane: 'central' }),

  getSubscriptions: () => fetchApi<any>('/subscriptions', { plane: 'central' }).then((r) => extractList(r, normalizeSubscription)),
  createSubscription: (data: Partial<Subscription>) => fetchApi<any>('/subscriptions', { method: 'POST', body: JSON.stringify({ tenant: data.tenant_id, package: data.package_id, billing_cycle: 'monthly', status: 'active' }), plane: 'central' }).then(normalizeSubscription),
  cancelSubscription: (id: string) => fetchApi<any>(`/subscriptions/${id}/cancel`, { method: 'POST', plane: 'central' }).then((res) => normalizeSubscription(res?.subscription || res)),
  changeSubscriptionPackage: (subId: string, pkgId: string) => fetchApi<any>(`/subscriptions/${subId}`, { method: 'PATCH', body: JSON.stringify({ package: pkgId }), plane: 'central' }).then(normalizeSubscription),

  getPayments: () => fetchApi<any>('/payments', { plane: 'central' }).then((r) => extractList(r, normalizePayment)),
  createPayment: (data: Partial<Payment>) => {
    const payload: Record<string, any> = { amount: data.amount, payment_method: data.payment_method || 'bKash', status: 'Completed' };
    if ((data as any).tenant_id) payload.tenant = (data as any).tenant_id;
    else if (data.tenant_name) payload.tenant_name = data.tenant_name;
    return fetchApi<any>('/payments', { method: 'POST', body: JSON.stringify(payload), plane: 'central' }).then(normalizePayment);
  },
  refundPayment: (id: string) => fetchApi<any>(`/payments/${id}/refund`, { method: 'POST', plane: 'central' }).then(normalizePayment),

  getBackups: () => fetchApi<any>('/backups', { plane: 'central' }).then((r) => extractList(r, normalizeBackup)),
  createBackup: (tenantId: string, backupType: 'full' | 'database' | 'media' = 'full') => {
    const payload: Record<string, any> = {
      name: `Snapshot - ${new Date().toISOString().slice(0, 16)}`,
      backup_type: backupType === 'database' ? 'database_only' : 'full_database',
    };
    if (tenantId && tenantId !== 'all') payload.tenant = tenantId;
    return fetchApi<any>('/backups/create-backup', { method: 'POST', body: JSON.stringify(payload), plane: 'central' }).then((res) => normalizeBackup(res?.backup || res));
  },
  deleteBackup: (id: string) => fetchApi<void>(`/backups/${id}`, { method: 'DELETE', plane: 'central' }),

  getAuditLogs: () => fetchApi<any>('/audit-logs', { plane: 'central' }).then((r) => extractList(r, normalizeAuditLog)),
  logAction: async (action: string, details: Record<string, any>, tenantId?: string) => {
    try {
      await fetchApi('/audit-logs', { method: 'POST', body: JSON.stringify({ action, details, tenant_id: tenantId }), plane: 'central' });
    } catch { /* ignore */ }
  },

  getFeatureMatrix: () => fetchApi<FeatureMatrixResponse>('/feature-matrix', { plane: 'central' }),
  setFeatureFlag: (tenantId: string, feature_key: string, enabled: boolean, config?: Record<string, any>) =>
    fetchApi<{ message: string }>('/feature-flags/set', { method: 'POST', body: JSON.stringify({ tenant: tenantId, tenant_id: tenantId, feature_key, enabled, config: config || {} }), plane: 'central' }),
  bulkSetFeatureFlags: (tenantId: string, flags: Array<{ feature_key: string; enabled: boolean; config?: Record<string, any> }>) =>
    fetchApi<{ applied: string[]; applied_count: number }>('/feature-flags/bulk-set', { method: 'POST', body: JSON.stringify({ tenant: tenantId, tenant_id: tenantId, flags }), plane: 'central' }),
  cloneTenantFeatures: (sourceTenantId: string, targetTenantId: string) =>
    fetchApi<{ message: string }>('/feature-flags/clone', { method: 'POST', body: JSON.stringify({ source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId }), plane: 'central' }),
  resetTenantFeatures: (tenantId: string) =>
    fetchApi<{ message: string; features: any }>('/feature-flags/reset', { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }), plane: 'central' }),

  getPlatformHealth: () => fetchApi<SaaSPlatformHealth>('/health', { plane: 'central' }),

  getEmployees: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<any>(`/employees${qs}`, { plane: 'central' }).then((r) => extractList(r, normalizeEmployee));
  },
  createEmployee: (data: Partial<SaaSEmployee>) => fetchApi<any>('/employees', { method: 'POST', body: JSON.stringify(data), plane: 'central' }).then(normalizeEmployee),
  updateEmployee: (id: string | number, data: Partial<SaaSEmployee>) => fetchApi<any>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data), plane: 'central' }).then(normalizeEmployee),
  deleteEmployee: (id: string | number) => fetchApi<void>(`/employees/${id}`, { method: 'DELETE', plane: 'central' }),

  approveOnboardingWithBootstrap: async (requestId: string) => {
    const res = await fetchApi<any>(`/requests/${requestId}/approve`, { method: 'POST', plane: 'central' });
    return {
      tenant: res?.tenant ? normalizeTenant(res.tenant) : null,
      tenant_id: res?.tenant_id || res?.tenant?.id || null,
      admin_username: res?.admin_username || null,
      admin_password: res?.admin_password || null,
      token: res?.token || null,
      message: res?.message || null,
    };
  },
};

export interface TenantLoginResponse {
    token?: string;
    session_token?: string;
    user?: any;
    tenant?: { id?: string; slug?: string; name?: string } | null;
    message?: string;
    /** Stage-2 trigger: backend wants the user to pick a database. */
    requires_tenant_selection?: boolean;
    available_tenants?: Array<{ id: string; name: string; slug: string }>;
}

export interface TenantResolveResponse {
  id: string;
  slug: string;
  name: string;
  domain: string;
  status: 'active' | 'suspended' | 'trial' | 'past_due';
  is_active: boolean;
  logo: string;
  favicon: string;
  branding: {
    company_name: string;
    tagline: string;
    theme_mode: 'light' | 'dark' | 'system' | 'midnight' | 'cyberpunk';
    accent_color: string;
    primary_color: string;
    secondary_color: string;
    currency_symbol: string;
    currency_code: string;
    support_phone: string;
    support_email: string;
    website: string;
  };
  enabled_modules: string[];
}

export interface NotificationItem {
  id: string;
  tenant?: string | null;
  user?: number | string | null;
  title: string;
  message: string;
  category: 'system' | 'billing' | 'network' | 'customer' | 'ticket';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  action_url?: string;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}

export interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  url: string;
  icon: string;
}

export interface GlobalSearchResponse {
  query: string;
  count: number;
  results: SearchResultItem[];
}

export const tenantApi = {
  login: async (credentials: { username: string; password: string; tenant?: string }): Promise<TenantLoginResponse> => {
    const payload: Record<string, string> = { username: credentials.username, password: credentials.password };
    if (credentials.tenant) payload.tenant = credentials.tenant;
    const res = await fetchApi<TenantLoginResponse>(
      '/auth/login', { method: 'POST', body: JSON.stringify(payload), plane: 'tenant' }
    );
    if (res && res.token && typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.tenantToken, res.token);
      if (res.user) localStorage.setItem(STORAGE_KEYS.tenantUser, JSON.stringify(res.user));
      if (res.tenant?.slug) localStorage.setItem(STORAGE_KEYS.tenantSlug, res.tenant.slug);
      if (res.tenant?.id) localStorage.setItem(STORAGE_KEYS.tenantId, res.tenant.id);
    }
    return res;
  },
  logout: async () => {
    try { await fetchApi('/auth/logout', { method: 'POST', plane: 'tenant' }); } catch { /* ignore */ }
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.tenantToken);
      localStorage.removeItem(STORAGE_KEYS.tenantUser);
    }
    return { success: true };
  },
  me: async () => {
    try {
      const res = await fetchApi<any>('/auth/me', { plane: 'tenant' });
      if (res && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.tenantUser, JSON.stringify(res));
      }
      return res;
    } catch (err) {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(STORAGE_KEYS.tenantUser);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    }
  },
  resolve: async (slugOrDomain: string): Promise<TenantResolveResponse> => {
    return fetchApi<TenantResolveResponse>(`/tenants/resolve/${encodeURIComponent(slugOrDomain)}`, {
      skipAuth: true,
      plane: 'tenant',
    });
  },
  requestPasswordReset: async (email: string, tenant?: string) =>
    fetchApi<{ detail: string }>('/auth/password-reset', {
      method: 'POST', body: JSON.stringify({ email, ...(tenant ? { tenant } : {}) }), plane: 'tenant',
    }),
};

export const notificationsApi = {
  list: async (params?: { page?: number; page_size?: number; is_read?: boolean }): Promise<{ count: number; results: NotificationItem[] } | NotificationItem[]> => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.page_size) query.set('page_size', String(params.page_size));
    if (params?.is_read !== undefined) query.set('is_read', String(params.is_read));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return fetchApi(`/notifications${qs}`);
  },
  getUnreadCount: async (): Promise<{ unread_count: number }> => {
    return fetchApi('/notifications/unread-count');
  },
  markAsRead: async (id: string): Promise<{ status: string; id: string }> => {
    return fetchApi(`/notifications/${id}/mark-as-read`, { method: 'POST' });
  },
  markAllRead: async (): Promise<{ status: string; count: number }> => {
    return fetchApi('/notifications/mark-all-read', { method: 'POST' });
  },
};

export const searchApi = {
  global: async (query: string): Promise<GlobalSearchResponse> => {
    if (!query || query.trim().length < 2) return { query, count: 0, results: [] };
    return fetchApi<GlobalSearchResponse>(`/search/?q=${encodeURIComponent(query.trim())}`);
  },
};

export const api = {
  saas: saasApi,
  tenant: tenantApi,
  notifications: notificationsApi,
  search: searchApi,
  getActivePlane,
  STORAGE_KEYS
};
export { detectPlane, effectivePlane };
export type { PlaneInfo } from '@/lib/plane';
