import {
  Tenant, Domain, OnboardingRequest, Package,
  Subscription, Payment, Backup, AuditLog, DashboardOverview,
  TenantTelemetry, TenantFeatureFlag, TenantAdmin, ImpersonateResult,
  FeatureMatrixResponse, SaaSPlatformHealth, SaaSEmployee,
  RouterItem, RouterHealthInfo, ConnectionTestResult, NetworkProfileItem,
  PPPoEAccountItem, ReconciliationRunItem, LiveSessionItem,
  CompanySetting, POPBranch
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
  /** HTTP status code returned by the backend (or ``0`` for network failures). */
  status: number;
  /** Optional structured failure code from the backend (e.g. ``SUPERADMIN_REQUIRES_CONTROL_PLANE``). */
  code?: string;
  /** Optional URL the UI should redirect to (e.g. central admin login). */
  control_plane_url?: string;
  constructor(status: number, message: string, extras?: { code?: string; control_plane_url?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (extras?.code) this.code = extras.code;
    if (extras?.control_plane_url) this.control_plane_url = extras.control_plane_url;
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
    let errorCode: string | undefined;
    let errorControlPlaneUrl: string | undefined;
    try {
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.error || errorData.message || JSON.stringify(errorData);
        errorCode = errorData.code;
        errorControlPlaneUrl = errorData.control_plane_url;
      } else if (contentType.includes('text/html')) {
        // The backend returned an HTML page (e.g. Django CSRF 403, proxy error,
        // maintenance page, or a redirect to a login page). Don't dump the
        // raw HTML into the UI — surface a short, human-friendly message
        // keyed off the status code so callers can still branch on it.
        await response.text(); // drain the body so the connection can be reused
        if (response.status === 403) {
          errorMsg =
            'The backend rejected the request (HTTP 403). This often means CSRF ' +
            'protection blocked the cross-origin request, or the API endpoint ' +
            'requires a different authentication header.';
        } else if (response.status >= 500) {
          errorMsg = `Backend server error (HTTP ${response.status}). The endpoint may be down or behind a proxy.`;
        } else {
          errorMsg = `Backend returned an HTML response instead of JSON (HTTP ${response.status}). Check the API URL.`;
        }
      } else {
        errorMsg = await response.text();
      }
    } catch { /* ignore */ }
    throw new ApiError(response.status, errorMsg, { code: errorCode, control_plane_url: errorControlPlaneUrl });
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

  /**
   * Step 1 of the central-plane password reset flow. The backend always
   * returns 200 to prevent user enumeration — even when no super-admin
   * matches the supplied email.
   */
  requestPasswordReset: async (email: string) =>
    fetchApi<{ detail: string }>('/auth/password-reset', {
      method: 'POST',
      body: JSON.stringify({ email: (email || '').trim().toLowerCase() }),
      plane: 'central',
      skipAuth: true,
    }),

  /**
   * Step 2 of the central-plane password reset flow. Validates the
   * cryptographic token emailed to the operator and rotates their password.
   * Backend revokes all existing DRF tokens on success so the next
   * `/auth/login` uses a fresh auth state.
   */
  confirmPasswordReset: async (uid: string, newPassword: string, token: string) =>
    fetchApi<{ detail: string }>('/auth/password-reset-confirm', {
      method: 'POST',
      body: JSON.stringify({ uid, token, new_password: newPassword }),
      plane: 'central',
      skipAuth: true,
    }),

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

  /**
   * Re-send the claim email for an approved onboarding request. The backend
   * calls `EmailService.send_client_onboarding_email` with the supplied
   * `claim_url` as the portal URL and `admin_password` as the body password.
   * Falls back to a generic 400 if the request is not in `approved` state.
   */
  notifyOnboarding: (id: string, payload?: { claim_url?: string; admin_password?: string }) =>
    fetchApi<{
      sent: boolean;
      recipient: string;
      channel: 'email' | 'sms' | 'none';
      admin_username: string;
      claim_url: string;
      audit_log_id: string;
      message: string;
    }>(`/requests/${id}/notify`, { method: 'POST', body: JSON.stringify(payload || {}), plane: 'central' }),

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

/**
 * Row returned by ``GET /api/v1/auth/my-tenants/`` — the ISP-Admin's
 * accessible tenants on ``app.example.com``. The dashboard renders
 * one card per tenant and the operator clicks the "Open" link to
 * enter the actual ERP software on the tenant subdomain.
 */
export interface ISPAdminTenant {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    primary_hostname: string | null;
    tenant_url: string;
    role: string | null;
    plan: string | null;
    subscription_active: boolean;
    contact_email: string;
    contact_phone: string;
    logo_url: string;
    address: string;
    created_at: string | null;
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

  /**
   * ISP_ADMIN portal: list the tenants this user can manage. Powers the
   * ``app.example.com`` landing dashboard that lets a multi-tenant ISP
   * operator see all their tenants + subscriptions at a glance and pick
   * which tenant subdomain to enter.
   */
  myTenants: async (): Promise<{ count: number; items: ISPAdminTenant[]; is_isp_admin: boolean }> => {
    try {
      return await fetchApi<{ count: number; items: ISPAdminTenant[]; is_isp_admin: boolean }>(
        '/auth/my-tenants',
        { plane: 'tenant' },
      );
    } catch {
      return { count: 0, items: [], is_isp_admin: false };
    }
  },

  /**
   * ISP_ADMIN portal: self-service password change.
   */
  changePassword: async (current_password: string, new_password: string) =>
    fetchApi<{ message: string; token: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
      plane: 'tenant',
    }),
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

  /** Bootstrap password rotation — called after a sass-admin creates a new admin. */
  setPassword: async (username: string, password: string, tenant?: string) =>
    fetchApi<{ detail: string }>('/auth/set-password', {
      method: 'POST',
      body: JSON.stringify({ username, password, ...(tenant ? { tenant } : {}) }),
      plane: 'tenant',
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

// ── Domain Types for Customer -> Service -> Subscription -> Invoice -> Payment ──

export interface CustomerItem {
  id: string;
  customer_code: string;
  full_name: string;
  mobile: string;
  email?: string;
  address?: string;
  area_zone?: string;
  connection_type?: string;
  pppoe_username: string;
  package?: string;
  package_name?: string;
  package_speed?: number;
  router?: string;
  router_name?: string;
  monthly_bill: number | string;
  due_amount: number | string;
  advance_amount: number | string;
  discount: number | string;
  bill_date?: string;
  expiry_date?: string;
  promise_date?: string;
  status: string;
  services_count?: number;
  live_session?: { is_online: boolean; ip_address?: string; uptime?: string };
  created_at: string;
}

export interface CustomerCreatePayload {
  customer_code?: string;
  full_name: string;
  mobile: string;
  email?: string;
  address?: string;
  area_zone?: string;
  connection_type?: string;
  pppoe_username: string;
  pppoe_password?: string;
  package?: string;
  router?: string;
  monthly_bill?: number | string;
  discount?: number | string;
  status?: string;
  remarks?: string;
}

export interface CustomerServiceItem {
  id: string;
  tenant: string;
  customer: string;
  customer_name?: string;
  customer_code?: string;
  package?: string;
  package_name?: string;
  package_speed?: number;
  service_type: 'BROADBAND' | 'STATIC_IP' | 'IPTV' | 'VOIP' | 'LEASED_LINE' | string;
  service_identifier: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' | string;
  activation_date?: string;
  termination_date?: string;
  monthly_price: number | string;
  router?: string;
  router_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerSubscriptionItem {
  id: string;
  tenant: string;
  customer: string;
  customer_name?: string;
  customer_code?: string;
  service: string;
  service_identifier?: string;
  service_type?: string;
  package?: string;
  package_name?: string;
  billing_cycle: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | string;
  price: number | string;
  discount: number | string;
  status: 'PENDING' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED' | string;
  start_date: string;
  next_billing_date?: string;
  end_date?: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export interface IspPackageItem {
  id: string;
  name: string;
  mikrotik_profile: string;
  speed_mbps: number;
  upload_speed_mbps?: number;
  validity_days: number;
  regular_price: number | string;
  min_reseller_price?: number | string;
  description?: string;
  is_active: boolean;
  subscribers_count?: number;
  created_at?: string;
}

export interface IspInvoiceItem {
  id: string;
  invoice_no: string;
  customer: string;
  customer_name?: string;
  customer_username?: string;
  service?: string;
  service_identifier?: string;
  subscription?: string;
  billing_month: string;
  package_name: string;
  package_amount: number | string;
  previous_due: number | string;
  discount: number | string;
  total_payable: number | string;
  paid_amount: number | string;
  due_amount: number | string;
  status: 'DRAFT' | 'ISSUED' | 'UNPAID' | 'PAID' | 'PARTIAL' | 'CANCELLED' | 'VOID' | string;
  due_date?: string;
  created_at: string;
}

export interface IspPaymentItem {
  id: string;
  customer?: string;
  customer_name?: string;
  customer_username?: string;
  invoice?: string;
  amount: number | string;
  trx_id: string;
  payment_method: string;
  status: string;
  created_at: string;
}

// ── Domain API Clients ──

export const customerApi = {
  list: async (params?: { page?: number; page_size?: number; search?: string; status?: string; package?: string }): Promise<{ items: CustomerItem[]; total: number; page: number; pageSize: number }> => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.page_size) q.set('page_size', String(params.page_size));
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.package) q.set('package', params.package);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/customers/${qs}`, { plane: 'tenant' });
    const items: CustomerItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total, page: params?.page || 1, pageSize: params?.page_size || 10 };
  },
  get: async (id: string): Promise<CustomerItem> => {
    return fetchApi<CustomerItem>(`/customers/${id}`, { plane: 'tenant' });
  },
  create: async (data: CustomerCreatePayload): Promise<CustomerItem> => {
    return fetchApi<CustomerItem>('/customers/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  update: async (id: string, data: Partial<CustomerCreatePayload>): Promise<CustomerItem> => {
    return fetchApi<CustomerItem>(`/customers/${id}/`, { method: 'PATCH', body: JSON.stringify(data), plane: 'tenant' });
  },
  archive: async (id: string): Promise<{ message: string; status: string }> => {
    return fetchApi(`/customers/${id}/archive/`, { method: 'POST', plane: 'tenant' });
  },
  changeStatus: async (id: string, status: string, reason?: string): Promise<{ message: string; status: string }> => {
    return fetchApi(`/customers/${id}/status/`, { method: 'POST', body: JSON.stringify({ status, reason }), plane: 'tenant' });
  },
};

export const serviceApi = {
  list: async (params?: { customer?: string; status?: string; service_type?: string; page?: number }): Promise<{ items: CustomerServiceItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.customer) q.set('customer', params.customer);
    if (params?.status) q.set('status', params.status);
    if (params?.service_type) q.set('service_type', params.service_type);
    if (params?.page) q.set('page', String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/services/${qs}`, { plane: 'tenant' });
    const items: CustomerServiceItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<CustomerServiceItem> => {
    return fetchApi<CustomerServiceItem>(`/services/${id}`, { plane: 'tenant' });
  },
  create: async (data: Partial<CustomerServiceItem>): Promise<CustomerServiceItem> => {
    return fetchApi<CustomerServiceItem>('/services/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  activate: async (id: string): Promise<{ message: string; service: CustomerServiceItem }> => {
    return fetchApi(`/services/${id}/activate/`, { method: 'POST', plane: 'tenant' });
  },
  suspend: async (id: string, reason?: string): Promise<{ message: string; service: CustomerServiceItem }> => {
    return fetchApi(`/services/${id}/suspend/`, { method: 'POST', body: JSON.stringify({ reason }), plane: 'tenant' });
  },
  resume: async (id: string): Promise<{ message: string; service: CustomerServiceItem }> => {
    return fetchApi(`/services/${id}/resume/`, { method: 'POST', plane: 'tenant' });
  },
  terminate: async (id: string, reason?: string): Promise<{ message: string; service: CustomerServiceItem }> => {
    return fetchApi(`/services/${id}/terminate/`, { method: 'POST', body: JSON.stringify({ reason }), plane: 'tenant' });
  },
};

export const subscriptionApi = {
  list: async (params?: { customer?: string; service?: string; status?: string; page?: number }): Promise<{ items: CustomerSubscriptionItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.customer) q.set('customer', params.customer);
    if (params?.service) q.set('service', params.service);
    if (params?.status) q.set('status', params.status);
    if (params?.page) q.set('page', String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/subscriptions/${qs}`, { plane: 'tenant' });
    const items: CustomerSubscriptionItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<CustomerSubscriptionItem> => {
    return fetchApi<CustomerSubscriptionItem>(`/subscriptions/${id}`, { plane: 'tenant' });
  },
  create: async (data: Partial<CustomerSubscriptionItem>): Promise<CustomerSubscriptionItem> => {
    return fetchApi<CustomerSubscriptionItem>('/subscriptions/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  activate: async (id: string): Promise<{ message: string; subscription: CustomerSubscriptionItem }> => {
    return fetchApi(`/subscriptions/${id}/activate/`, { method: 'POST', plane: 'tenant' });
  },
  suspend: async (id: string): Promise<{ message: string; subscription: CustomerSubscriptionItem }> => {
    return fetchApi(`/subscriptions/${id}/suspend/`, { method: 'POST', plane: 'tenant' });
  },
  resume: async (id: string): Promise<{ message: string; subscription: CustomerSubscriptionItem }> => {
    return fetchApi(`/subscriptions/${id}/resume/`, { method: 'POST', plane: 'tenant' });
  },
  cancel: async (id: string): Promise<{ message: string; subscription: CustomerSubscriptionItem }> => {
    return fetchApi(`/subscriptions/${id}/cancel/`, { method: 'POST', plane: 'tenant' });
  },
  renew: async (id: string, days?: number): Promise<{ message: string; subscription: CustomerSubscriptionItem }> => {
    return fetchApi(`/subscriptions/${id}/renew/`, { method: 'POST', body: JSON.stringify({ days: days || 30 }), plane: 'tenant' });
  },
};

// ── Onboarding API surface (tenant plane) ────────────────────────────────

/**
 * Tenant-side CompanySetting API.
 *
 * The backend auto-creates a CompanySetting row on first GET (per
 * `CompanySettingViewSet.get_queryset`), so the wizard can always
 * PATCH by `id` after a single read.
 */
export const companySettingApi = {
  get: async (): Promise<CompanySetting> =>
    fetchApi<CompanySetting>('/company-settings/', { plane: 'tenant' }),

  partialUpdate: async (id: string, data: Partial<CompanySetting>): Promise<CompanySetting> =>
    fetchApi<CompanySetting>(`/company-settings/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      plane: 'tenant',
    }),

  /**
   * Convenience: PATCH /company-settings/{id}/ with a normalized subset of
   * branding fields the wizard collects (logo, color, theme, contact, currency).
   */
  applyBranding: async (data: Partial<{
    companyName: string;
    tagline: string;
    logoDataUrl: string | null;
    faviconUrl: string | null;
    brandColor: string;
    themeMode: CompanySetting['theme_mode'];
    currencyCode: string;
    currencySymbol: string;
    supportPhone: string;
    supportEmail: string;
  }>): Promise<CompanySetting> => {
    const current = await fetchApi<CompanySetting>('/company-settings/', { plane: 'tenant' });
    const payload: Partial<CompanySetting> = {};
    if (data.companyName !== undefined) payload.company_name = data.companyName;
    if (data.tagline !== undefined) payload.tagline = data.tagline;
    if (data.logoDataUrl !== undefined) payload.logo_url = data.logoDataUrl || '';
    if (data.faviconUrl !== undefined) payload.favicon_url = data.faviconUrl || '';
    if (data.brandColor !== undefined) payload.accent_color = data.brandColor;
    if (data.themeMode !== undefined) payload.theme_mode = data.themeMode;
    if (data.currencyCode !== undefined) payload.currency_code = data.currencyCode;
    if (data.currencySymbol !== undefined) payload.currency_symbol = data.currencySymbol;
    if (data.supportPhone !== undefined) payload.support_phone = data.supportPhone;
    if (data.supportEmail !== undefined) payload.support_email = data.supportEmail;
    return fetchApi<CompanySetting>(`/company-settings/${current.id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
      plane: 'tenant',
    });
  },
};

/**
 * Tenant-side POPBranch API. POPs require auth, so they're created
 * after step 6 signs the new admin in.
 */
export const branchApi = {
  list: async (params?: { status?: string; search?: string }): Promise<POPBranch[]> => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/branches/${qs}`, { plane: 'tenant' });
    return Array.isArray(res) ? res : (res?.results || []);
  },

  create: async (data: Omit<POPBranch, 'id' | 'tenant' | 'created_at' | 'updated_at'>): Promise<POPBranch> =>
    fetchApi<POPBranch>('/branches/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' }),
};

export const ispPackageApi = {
  list: async (params?: { page?: number; search?: string }): Promise<{ items: IspPackageItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/packages/${qs}`, { plane: 'tenant' });
    const items: IspPackageItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<IspPackageItem> => {
    return fetchApi<IspPackageItem>(`/packages/${id}`, { plane: 'tenant' });
  },
  create: async (data: Partial<IspPackageItem>): Promise<IspPackageItem> => {
    return fetchApi<IspPackageItem>('/packages/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  update: async (id: string, data: Partial<IspPackageItem>): Promise<IspPackageItem> => {
    return fetchApi<IspPackageItem>(`/packages/${id}/`, { method: 'PATCH', body: JSON.stringify(data), plane: 'tenant' });
  },
  syncToRouters: async (id: string): Promise<{ success: boolean; message: string }> => {
    return fetchApi(`/packages/${id}/sync-to-routers/`, { method: 'POST', plane: 'tenant' });
  },
};

export const invoiceApi = {
  list: async (params?: { customer?: string; status?: string; search?: string; page?: number }): Promise<{ items: IspInvoiceItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.customer) q.set('customer', params.customer);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/invoices/${qs}`, { plane: 'tenant' });
    const items: IspInvoiceItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<IspInvoiceItem> => {
    return fetchApi<IspInvoiceItem>(`/invoices/${id}`, { plane: 'tenant' });
  },
  create: async (data: Partial<IspInvoiceItem>): Promise<IspInvoiceItem> => {
    return fetchApi<IspInvoiceItem>('/invoices/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  issue: async (id: string): Promise<{ message: string; invoice: IspInvoiceItem }> => {
    return fetchApi(`/invoices/${id}/issue/`, { method: 'POST', plane: 'tenant' });
  },
  void: async (id: string, reason?: string): Promise<{ message: string; invoice: IspInvoiceItem }> => {
    return fetchApi(`/invoices/${id}/void/`, { method: 'POST', body: JSON.stringify({ reason }), plane: 'tenant' });
  },
  pay: async (id: string, data: { amount?: number | string; payment_method?: string }): Promise<any> => {
    return fetchApi(`/invoices/${id}/pay/`, { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
};

export const paymentApi = {
  list: async (params?: { customer?: string; page?: number }): Promise<{ items: IspPaymentItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.customer) q.set('customer', params.customer);
    if (params?.page) q.set('page', String(params.page));
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/payments/transactions/${qs}`, { plane: 'tenant' });
    const items: IspPaymentItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  create: async (data: { customer_id: string; amount: number; payment_method?: string; trx_id?: string; notes?: string }): Promise<any> => {
    return fetchApi('/payments/transactions/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
};

export const routerApi = {
  list: async (params?: { search?: string; status?: string }): Promise<{ items: RouterItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/network/routers/${qs}`, { plane: 'tenant' });
    const items: RouterItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<RouterItem> => {
    return fetchApi<RouterItem>(`/network/routers/${id}/`, { plane: 'tenant' });
  },
  create: async (data: Partial<RouterItem> & { password?: string }): Promise<RouterItem> => {
    return fetchApi<RouterItem>('/network/routers/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  update: async (id: string, data: Partial<RouterItem> & { password?: string }): Promise<RouterItem> => {
    return fetchApi<RouterItem>(`/network/routers/${id}/`, { method: 'PATCH', body: JSON.stringify(data), plane: 'tenant' });
  },
  delete: async (id: string): Promise<void> => {
    return fetchApi<void>(`/network/routers/${id}/`, { method: 'DELETE', plane: 'tenant' });
  },
  enable: async (id: string): Promise<{ message: string; is_active: boolean }> => {
    return fetchApi(`/network/routers/${id}/enable/`, { method: 'POST', plane: 'tenant' });
  },
  disable: async (id: string): Promise<{ message: string; is_active: boolean }> => {
    return fetchApi(`/network/routers/${id}/disable/`, { method: 'POST', plane: 'tenant' });
  },
  testConnection: async (id: string): Promise<ConnectionTestResult> => {
    return fetchApi<ConnectionTestResult>(`/network/routers/${id}/test-connection/`, { method: 'POST', plane: 'tenant' });
  },
  getHealth: async (id: string): Promise<RouterHealthInfo> => {
    return fetchApi<RouterHealthInfo>(`/network/routers/${id}/health/`, { plane: 'tenant' });
  },
  getRadiusScript: async (id: string, serverHost?: string): Promise<{ router_id: string; router_name: string; script: string }> => {
    const q = serverHost ? `?server_host=${encodeURIComponent(serverHost)}` : '';
    return fetchApi(`/network/routers/${id}/radius-script/${q}`, { plane: 'tenant' });
  },
  getActiveSessions: async (id: string): Promise<{ router_id: string; count: number; sessions: LiveSessionItem[] }> => {
    return fetchApi(`/network/routers/${id}/active-sessions/`, { plane: 'tenant' });
  },
  syncPPPoE: async (id: string): Promise<{ message: string; sessions_synced: number }> => {
    return fetchApi(`/network/routers/${id}/sync_pppoe/`, { method: 'POST', plane: 'tenant' });
  },
};

export const networkProfileApi = {
  list: async (params?: { search?: string; status?: string }): Promise<{ items: NetworkProfileItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/network/profiles/${qs}`, { plane: 'tenant' });
    const items: NetworkProfileItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<NetworkProfileItem> => {
    return fetchApi<NetworkProfileItem>(`/network/profiles/${id}/`, { plane: 'tenant' });
  },
  create: async (data: Partial<NetworkProfileItem>): Promise<NetworkProfileItem> => {
    return fetchApi<NetworkProfileItem>('/network/profiles/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  update: async (id: string, data: Partial<NetworkProfileItem>): Promise<NetworkProfileItem> => {
    return fetchApi<NetworkProfileItem>(`/network/profiles/${id}/`, { method: 'PATCH', body: JSON.stringify(data), plane: 'tenant' });
  },
};

export const pppoeAccountApi = {
  list: async (params?: { search?: string; router?: string; status?: string; provisioning_status?: string; service?: string }): Promise<{ items: PPPoEAccountItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.router) q.set('router', params.router);
    if (params?.status) q.set('status', params.status);
    if (params?.provisioning_status) q.set('provisioning_status', params.provisioning_status);
    if (params?.service) q.set('service', params.service);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/network/pppoe/${qs}`, { plane: 'tenant' });
    const items: PPPoEAccountItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  get: async (id: string): Promise<PPPoEAccountItem> => {
    return fetchApi<PPPoEAccountItem>(`/network/pppoe/${id}/`, { plane: 'tenant' });
  },
  create: async (data: Partial<PPPoEAccountItem> & { password?: string }): Promise<PPPoEAccountItem> => {
    return fetchApi<PPPoEAccountItem>('/network/pppoe/', { method: 'POST', body: JSON.stringify(data), plane: 'tenant' });
  },
  update: async (id: string, data: Partial<PPPoEAccountItem> & { password?: string }): Promise<PPPoEAccountItem> => {
    return fetchApi<PPPoEAccountItem>(`/network/pppoe/${id}/`, { method: 'PATCH', body: JSON.stringify(data), plane: 'tenant' });
  },
  provision: async (id: string): Promise<{ success: boolean; provisioning_status: string; status: string; last_error?: string }> => {
    return fetchApi(`/network/pppoe/${id}/provision/`, { method: 'POST', plane: 'tenant' });
  },
  suspend: async (id: string): Promise<{ success: boolean; status: string; provisioning_status: string }> => {
    return fetchApi(`/network/pppoe/${id}/suspend/`, { method: 'POST', plane: 'tenant' });
  },
  resume: async (id: string): Promise<{ success: boolean; status: string; provisioning_status: string }> => {
    return fetchApi(`/network/pppoe/${id}/resume/`, { method: 'POST', plane: 'tenant' });
  },
  terminate: async (id: string): Promise<{ success: boolean; status: string; provisioning_status: string }> => {
    return fetchApi(`/network/pppoe/${id}/terminate/`, { method: 'POST', plane: 'tenant' });
  },
  disconnectSession: async (id: string): Promise<{ username: string; router: string; session_dropped_on_device: boolean }> => {
    return fetchApi(`/network/pppoe/${id}/disconnect-session/`, { method: 'POST', plane: 'tenant' });
  },
};

export const reconciliationApi = {
  listRuns: async (): Promise<ReconciliationRunItem[]> => {
    const res = await fetchApi<any>('/network/reconciliation/runs/', { plane: 'tenant' });
    return Array.isArray(res) ? res : (res?.results || []);
  },
  trigger: async (routerId: string, asyncMode: boolean = false): Promise<any> => {
    return fetchApi('/network/reconciliation/trigger/', {
      method: 'POST',
      body: JSON.stringify({ router_id: routerId, async: asyncMode }),
      plane: 'tenant'
    });
  },
  repairItem: async (itemId: string, action: string = 'create_in_router'): Promise<any> => {
    return fetchApi(`/network/reconciliation/items/${itemId}/sync/`, {
      method: 'POST',
      body: JSON.stringify({ action }),
      plane: 'tenant'
    });
  },
  listSecrets: async (params?: { router?: string; status?: string; search?: string }): Promise<{ items: PPPoEAccountItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.router) q.set('router_id', params.router);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/network/reconciliation/secrets/${qs}`, { plane: 'tenant' });
    const items: PPPoEAccountItem[] = Array.isArray(res) ? res : (res?.results || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
};

export const liveSessionApi = {
  list: async (params?: { router?: string; search?: string }): Promise<{ items: LiveSessionItem[]; total: number }> => {
    const q = new URLSearchParams();
    if (params?.router) q.set('router', params.router);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchApi<any>(`/network/live-sessions/${qs}`, { plane: 'tenant' });
    const items: LiveSessionItem[] = Array.isArray(res) ? res : (res?.results || res?.sessions || []);
    const total = Array.isArray(res) ? res.length : (res?.count ?? items.length);
    return { items, total };
  },
  terminate: async (username: string): Promise<any> => {
    return fetchApi(`/network/live-sessions/${encodeURIComponent(username)}/terminate/`, { method: 'POST', plane: 'tenant' });
  },
};

export const api = {
  saas: saasApi,
  tenant: tenantApi,
  customer: customerApi,
  service: serviceApi,
  subscription: subscriptionApi,
  package: ispPackageApi,
  invoice: invoiceApi,
  payment: paymentApi,
  router: routerApi,
  networkProfile: networkProfileApi,
  pppoeAccount: pppoeAccountApi,
  reconciliation: reconciliationApi,
  liveSession: liveSessionApi,
  notifications: notificationsApi,
  search: searchApi,
  companySetting: companySettingApi,
  branch: branchApi,
  getActivePlane,
  STORAGE_KEYS
};
export { detectPlane, effectivePlane };
export type { PlaneInfo } from '@/lib/plane';

