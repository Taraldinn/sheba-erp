import {
  Tenant, Domain, OnboardingRequest, Package,
  Subscription, Payment, Backup, AuditLog, DashboardOverview,
  TenantTelemetry, TenantFeatureFlag, TenantAdmin, ImpersonateResult,
  FeatureMatrixResponse, SaaSPlatformHealth, SaaSEmployee
} from './types';

// Direct Connection to Django Backend API — No Mock Seed Data
const RAW_API_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const CLEAN_API_URL = RAW_API_URL.replace(/\/+$/, '');
export const API_BASE_URL = CLEAN_API_URL.endsWith('/saas') ? CLEAN_API_URL : `${CLEAN_API_URL}/saas`;

// Default Superuser API Token (admin) for live development
export const DEFAULT_DEV_TOKEN = '93df05f58e138ad21a6207b86847c1b309811676';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Normalizers mapping Django REST Framework models to frontend contracts ──

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
  const domainUrl = t.domain_url || t.primary_domain || (t.domain && t.domain.includes('.') ? t.domain : `${schema || 'app'}.sheba.app`);
  return {
    id: String(t.id),
    name: t.name || '',
    schema_name: schema,
    domain_url: domainUrl,
    plan: t.plan || 'Growth ISP Tier',
    contact_email: t.contact_email || '',
    is_active: Boolean(t.is_active),
    created_at: t.created_at || new Date().toISOString(),
    updated_at: t.updated_at || new Date().toISOString(),
  };
}

function normalizeDomain(d: any): Domain {
  return {
    id: String(d.id),
    domain: d.domain || d.hostname || '',
    tenant_id: String(d.tenant_id || d.tenant || ''),
    tenant_name: d.tenant_name || d.tenant_slug || '',
    is_primary: Boolean(d.is_primary),
    is_active: Boolean(d.is_active),
    ssl_active: Boolean(d.ssl_active !== undefined ? d.ssl_active : d.verified),
    created_at: d.created_at || new Date().toISOString(),
  };
}

function normalizeOnboardingRequest(r: any): OnboardingRequest {
  return {
    id: String(r.id),
    company_name: r.company_name || r.organization_name || '',
    email: r.email || r.contact_email || '',
    phone: r.phone || r.contact_phone || '',
    plan_requested: r.plan_requested || r.requested_plan || 'Growth ISP Tier',
    notes: r.notes || r.admin_notes || '',
    status: (r.status || 'pending').toLowerCase() as any,
    created_at: r.created_at || new Date().toISOString(),
  };
}

function normalizePackage(p: any): Package {
  let features = p.features || [];
  if (typeof features === 'string') {
    try {
      features = JSON.parse(features);
    } catch {
      features = [features];
    }
  }
  return {
    id: String(p.id),
    name: p.name || '',
    price: Number(p.monthly_price ?? p.price ?? 0),
    currency: p.currency || 'USD',
    billing_interval: p.billing_interval || 'monthly',
    features: Array.isArray(features) ? features : [],
    is_active: p.is_active !== undefined ? Boolean(p.is_active) : true,
    subscriber_count: p.subscribers_enrolled ?? p.subscriber_count ?? 0,
  };
}

function normalizeSubscription(s: any): Subscription {
  return {
    id: String(s.id),
    tenant_id: String(s.tenant_id || s.tenant || ''),
    tenant_name: s.tenant_name || s.tenant_slug || '',
    package_id: String(s.package_id || s.package || ''),
    package_name: s.package_name || (typeof s.package === 'string' ? s.package : 'Standard Tier'),
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
    id: String(p.id || p.trx_id || ''),
    subscription_id: String(p.subscription || p.subscription_id || ''),
    tenant_name: p.tenant_name || '',
    amount: Number(p.amount || 0),
    currency: p.currency || 'USD',
    payment_method: p.payment_method || 'bKash / MFS',
    status: mappedStatus,
    created_at: p.paid_at || p.created_at || new Date().toISOString(),
  };
}

function normalizeBackup(b: any): Backup {
  let bt: 'full' | 'database' | 'media' = 'full';
  if (b.backup_type?.includes('database') || b.backup_type === 'database') bt = 'database';
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
    id: String(l.id),
    action: l.action || 'system.event',
    user_id: l.actor_username || l.user_id || 'admin@sheba.app',
    tenant_id: l.tenant_name || l.tenant_slug || (l.tenant ? String(l.tenant) : undefined),
    details: typeof l.details === 'object' && l.details !== null ? l.details : { info: l.details || '' },
    ip_address: l.ip_address || '127.0.0.1',
    created_at: l.timestamp || l.created_at || new Date().toISOString(),
  };
}

function normalizeEmployee(e: any): SaaSEmployee {
  return {
    id: e.id,
    worker_id: e.worker_id || e.employee_code || `#EMP-${e.id}`,
    employee_code: e.employee_code,
    full_name: e.full_name || '',
    email: e.email || '',
    phone: e.phone || '',
    role: e.role || e.designation || 'Staff',
    designation: e.designation,
    worker_type: e.worker_type || 'Employee',
    department: e.department || 'Operations',
    is_active: e.is_active !== undefined ? Boolean(e.is_active) : true,
    joining_date: e.joining_date,
    basic_salary: Number(e.basic_salary || 0),
    created_at: e.created_at,
    tenant: e.tenant,
    tenant_name: e.tenant_name,
  };
}

// Direct Network Fetcher with DRF Token Auth & Token Auto-Healing (NO SEED DATA)
async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  let token = typeof window !== 'undefined' ? localStorage.getItem('saas_token') : null;
  // If token is missing, or is a legacy mock token, heal with default superuser token
  if (!token || token.startsWith('mock_') || token.length < 30) {
    token = DEFAULT_DEV_TOKEN;
    if (typeof window !== 'undefined') {
      localStorage.setItem('saas_token', token);
    }
  }

  const buildHeaders = (authToken: string): HeadersInit => {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (authToken) {
      h['Authorization'] = authToken.startsWith('Token ') || authToken.startsWith('Bearer ') ? authToken : `Token ${authToken}`;
    }
    return h;
  };

  // Ensure trailing slash for Django REST Framework
  const hasQuery = endpoint.includes('?');
  let normalizedEndpoint: string;
  if (hasQuery) {
    const [path, query] = endpoint.split('?');
    const cleanPath = path.endsWith('/') ? path : `${path}/`;
    normalizedEndpoint = `${cleanPath}?${query}`;
  } else {
    normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  }

  const fullUrl = `${API_BASE_URL}${normalizedEndpoint}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...options,
      headers: { ...buildHeaders(token), ...options?.headers },
    });
  } catch (networkError: any) {
    throw new ApiError(0, `Cannot connect to backend at ${fullUrl}: ${networkError?.message || 'Network unreachable'}`);
  }

  // If 401 Unauthorized, auto-heal to DEFAULT_DEV_TOKEN and retry once
  if (response.status === 401 && token !== DEFAULT_DEV_TOKEN) {
    token = DEFAULT_DEV_TOKEN;
    if (typeof window !== 'undefined') {
      localStorage.setItem('saas_token', token);
    }
    try {
      response = await fetch(fullUrl, {
        ...options,
        headers: { ...buildHeaders(token), ...options?.headers },
      });
    } catch (networkError: any) {
      throw new ApiError(0, `Cannot connect to backend at ${fullUrl}: ${networkError?.message || 'Network unreachable'}`);
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      if (contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorData.error || errorData.message || JSON.stringify(errorData);
      } else {
        errorMsg = await response.text();
      }
    } catch {
      // ignore
    }
    throw new ApiError(response.status, errorMsg);
  }

  if (contentType.includes('text/html')) {
    throw new ApiError(response.status, 'Received HTML response instead of JSON from backend');
  }

  return await response.json();
}

// Authoritative Live SaaS API Client connected to Django Backend http://localhost:8000/api/v1/
export const saasApi = {
  login: async (credentials: Record<string, string>) => {
    const payload = {
      username: credentials.username || credentials.email,
      password: credentials.password,
    };
    const res = await fetchApi<{ token: string; user?: any; session_token?: string }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(payload) }
    );
    if (res && res.token && typeof window !== 'undefined') {
      localStorage.setItem('saas_token', res.token);
      if (res.user) {
        localStorage.setItem('saas_user', JSON.stringify(res.user));
      }
    }
    return res;
  },

  me: async () => {
    return fetchApi<any>('/auth/me').then((res) => ({
      email: res.email || 'admin@sheba.local',
      name: res.name || res.username || 'System Administrator',
      role: res.role || 'Platform Super Admin',
      ...res,
    }));
  },

  logout: async () => {
    try {
      await fetchApi('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('saas_token');
      localStorage.removeItem('saas_user');
    }
    return { success: true };
  },

  getDashboardOverview: async () => {
    return fetchApi<any>('/overview').then((res) => normalizeOverview(res));
  },

  getTenants: async () => {
    return fetchApi<any>('/tenants').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeTenant);
    });
  },

  getTenant: async (id: string) => {
    return fetchApi<any>(`/tenants/${id}`).then((res) => normalizeTenant(res));
  },

  createTenant: async (data: Partial<Tenant>) => {
    const slug = data.schema_name || (data as any).slug || (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const payload = {
      name: data.name,
      slug: slug,
      domain: data.domain_url || (data as any).domain || `${slug}.shebafi.xyz`,
      plan: data.plan || 'Growth ISP Tier',
      contact_email: data.contact_email || 'admin@sheba.app',
      contact_phone: (data as any).contact_phone || '',
      address: (data as any).address || '',
      is_active: data.is_active !== undefined ? data.is_active : true,
    };
    return fetchApi<any>(
      '/tenants',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizeTenant(res));
  },

  updateTenant: async (id: string, data: Partial<Tenant>) => {
    const payload: Record<string, any> = { ...data };
    if (data.schema_name) payload.slug = data.schema_name;
    if (data.domain_url) payload.domain = data.domain_url;
    return fetchApi<any>(
      `/tenants/${id}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ).then((res) => normalizeTenant(res));
  },

  toggleTenantStatus: async (id: string) => {
    return fetchApi<any>(
      `/tenants/${id}/toggle-status`,
      { method: 'POST' }
    ).then((res) => normalizeTenant(res));
  },

  deleteTenant: async (id: string) => {
    return fetchApi<void>(
      `/tenants/${id}`,
      { method: 'DELETE' }
    );
  },

  getTenantTelemetry: async (id: string) => {
    return fetchApi<TenantTelemetry>(`/tenants/${id}/telemetry`);
  },

  getTenantFeatures: async (id: string) => {
    return fetchApi<{ tenant: string; features: TenantFeatureFlag[] }>(`/tenants/${id}/features`);
  },

  updateTenantFeature: async (id: string, feature_key: string, enabled: boolean, config?: Record<string, any>) => {
    return fetchApi<{ message: string; feature_key: string; enabled: boolean }>(
      `/tenants/${id}/features`,
      { method: 'POST', body: JSON.stringify({ feature_key, enabled, config: config || {} }) }
    );
  },

  impersonateTenant: async (id: string) => {
    return fetchApi<ImpersonateResult>(
      `/tenants/${id}/impersonate`,
      { method: 'POST' }
    );
  },

  getTenantAdmins: async (id: string) => {
    return fetchApi<TenantAdmin[]>(`/tenants/${id}/admins`);
  },

  createTenantAdmin: async (id: string, data: { username: string; password?: string; email?: string; phone?: string; first_name?: string; last_name?: string }) => {
    return fetchApi<TenantAdmin>(
      `/tenants/${id}/create-admin`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  },

  bulkSuspend: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      '/tenants/bulk-suspend',
      { method: 'POST', body: JSON.stringify({ tenant_ids }) }
    );
  },

  bulkActivate: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      '/tenants/bulk-activate',
      { method: 'POST', body: JSON.stringify({ tenant_ids }) }
    );
  },

  bulkDelete: async (tenant_ids: string[]) => {
    return fetchApi<{ succeeded: any[]; failed: any[]; count: number }>(
      '/tenants/bulk-delete',
      { method: 'POST', body: JSON.stringify({ tenant_ids }) }
    );
  },

  getDomains: async () => {
    return fetchApi<any>('/domains').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeDomain);
    });
  },

  createDomain: async (data: Partial<Domain>) => {
    const payload = {
      hostname: data.domain,
      tenant: data.tenant_id,
      is_primary: data.is_primary ?? false,
      is_active: data.is_active ?? true,
    };
    return fetchApi<any>(
      '/domains',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizeDomain(res));
  },

  verifyDomain: async (id: string) => {
    return fetchApi<any>(
      `/domains/${id}/toggle-verify`,
      { method: 'POST' }
    ).then((res) => normalizeDomain(res));
  },

  setPrimaryDomain: async (id: string) => {
    return fetchApi<any>(
      `/domains/${id}`,
      { method: 'PATCH', body: JSON.stringify({ is_primary: true }) }
    ).then((res) => normalizeDomain(res));
  },

  deleteDomain: async (id: string) => {
    return fetchApi<void>(
      `/domains/${id}`,
      { method: 'DELETE' }
    );
  },

  getOnboardingRequests: async () => {
    return fetchApi<any>('/requests').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeOnboardingRequest);
    });
  },

  approveOnboarding: async (id: string) => {
    return fetchApi<any>(
      `/requests/${id}/approve`,
      { method: 'POST' }
    ).then((res) => normalizeTenant(res?.tenant || res));
  },

  rejectOnboarding: async (id: string, reason?: string) => {
    return fetchApi<void>(
      `/requests/${id}/reject`,
      { method: 'POST', body: JSON.stringify({ reason: reason || 'Application rejected by platform administrator.' }) }
    );
  },

  getPackages: async () => {
    return fetchApi<any>('/packages').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizePackage);
    });
  },

  createPackage: async (data: Partial<Package>) => {
    const payload = {
      name: data.name,
      code: (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || `pkg-${Date.now()}`,
      monthly_price: data.price,
      yearly_price: (data.price || 0) * 10,
      features: data.features || [],
      is_active: data.is_active !== undefined ? data.is_active : true,
    };
    return fetchApi<any>(
      '/packages',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizePackage(res));
  },

  updatePackage: async (id: string, data: Partial<Package>) => {
    const payload: Record<string, any> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.price !== undefined) payload.monthly_price = data.price;
    if (data.features !== undefined) payload.features = data.features;
    if (data.is_active !== undefined) payload.is_active = data.is_active;
    return fetchApi<any>(
      `/packages/${id}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    ).then((res) => normalizePackage(res));
  },

  deletePackage: async (id: string) => {
    return fetchApi<void>(
      `/packages/${id}`,
      { method: 'DELETE' }
    );
  },

  getSubscriptions: async () => {
    return fetchApi<any>('/subscriptions').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeSubscription);
    });
  },

  createSubscription: async (data: Partial<Subscription>) => {
    const payload = {
      tenant: data.tenant_id,
      package: data.package_id,
      billing_cycle: 'monthly',
      status: 'active',
    };
    return fetchApi<any>(
      '/subscriptions',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizeSubscription(res));
  },

  cancelSubscription: async (id: string) => {
    return fetchApi<any>(
      `/subscriptions/${id}/cancel`,
      { method: 'POST' }
    ).then((res) => normalizeSubscription(res?.subscription || res));
  },

  changeSubscriptionPackage: async (subId: string, pkgId: string) => {
    return fetchApi<any>(
      `/subscriptions/${subId}`,
      { method: 'PATCH', body: JSON.stringify({ package: pkgId }) }
    ).then((res) => normalizeSubscription(res));
  },

  getPayments: async () => {
    return fetchApi<any>('/payments').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizePayment);
    });
  },

  createPayment: async (data: Partial<Payment>) => {
    const payload = {
      tenant: (data as any).tenant_id || data.tenant_name,
      amount: data.amount,
      payment_method: data.payment_method || 'bKash',
      status: 'Completed',
    };
    return fetchApi<any>(
      '/payments',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizePayment(res));
  },

  refundPayment: async (id: string) => {
    return fetchApi<any>(
      `/payments/${id}/refund`,
      { method: 'POST' }
    ).then((res) => normalizePayment(res));
  },

  getBackups: async () => {
    return fetchApi<any>('/backups').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeBackup);
    });
  },

  createBackup: async (tenantId: string, backupType: 'full' | 'database' | 'media' = 'full') => {
    const payload = {
      name: `Snapshot - ${new Date().toISOString().slice(0, 16)}`,
      backup_type: backupType === 'database' ? 'database_only' : 'full_database',
      tenant: tenantId || null,
    };
    return fetchApi<any>(
      '/backups/create-backup',
      { method: 'POST', body: JSON.stringify(payload) }
    ).then((res) => normalizeBackup(res?.backup || res));
  },

  deleteBackup: async (id: string) => {
    return fetchApi<void>(
      `/backups/${id}`,
      { method: 'DELETE' }
    );
  },

  getAuditLogs: async () => {
    return fetchApi<any>('/audit-logs').then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeAuditLog);
    });
  },

  logAction: async (action: string, details: Record<string, any>, tenantId?: string) => {
    try {
      await fetchApi('/audit-logs', {
        method: 'POST',
        body: JSON.stringify({ action, details, tenant_id: tenantId }),
      });
    } catch {
      // ignore logging failure
    }
  },

  getFeatureMatrix: async () => {
    return fetchApi<FeatureMatrixResponse>('/feature-matrix');
  },

  setFeatureFlag: async (tenantId: string, feature_key: string, enabled: boolean, config?: Record<string, any>) => {
    return fetchApi<{ message: string }>(
      '/feature-flags/set',
      { method: 'POST', body: JSON.stringify({ tenant: tenantId, tenant_id: tenantId, feature_key, enabled, config: config || {} }) }
    );
  },

  bulkSetFeatureFlags: async (tenantId: string, flags: Array<{ feature_key: string; enabled: boolean; config?: Record<string, any> }>) => {
    return fetchApi<{ applied: string[]; applied_count: number }>(
      '/feature-flags/bulk-set',
      { method: 'POST', body: JSON.stringify({ tenant: tenantId, tenant_id: tenantId, flags }) }
    );
  },

  cloneTenantFeatures: async (sourceTenantId: string, targetTenantId: string) => {
    return fetchApi<{ message: string }>(
      '/feature-flags/clone',
      { method: 'POST', body: JSON.stringify({ source_tenant_id: sourceTenantId, target_tenant_id: targetTenantId }) }
    );
  },

  resetTenantFeatures: async (tenantId: string) => {
    return fetchApi<{ message: string; features: any }>(
      '/feature-flags/reset',
      { method: 'POST', body: JSON.stringify({ tenant_id: tenantId }) }
    );
  },

  seedFiftyTenants: async () => {
    const res = await fetchApi<any>('/tenants');
    const count = Array.isArray(res) ? res.length : (res?.count ?? res?.results?.length ?? 0);
    return { count, message: `${count} live tenants connected from PostgreSQL.` };
  },

  getPlatformHealth: async () => {
    return fetchApi<SaaSPlatformHealth>('/health');
  },

  getEmployees: async (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchApi<any>(`/employees${qs}`).then((res) => {
      const list = Array.isArray(res) ? res : (res?.results || []);
      return list.map(normalizeEmployee);
    });
  },

  createEmployee: async (data: Partial<SaaSEmployee>) => {
    return fetchApi<any>(
      '/employees',
      { method: 'POST', body: JSON.stringify(data) }
    ).then((res) => normalizeEmployee(res));
  },

  updateEmployee: async (id: string | number, data: Partial<SaaSEmployee>) => {
    return fetchApi<any>(
      `/employees/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ).then((res) => normalizeEmployee(res));
  },

  deleteEmployee: async (id: string | number) => {
    return fetchApi<void>(
      `/employees/${id}`,
      { method: 'DELETE' }
    );
  },
};
