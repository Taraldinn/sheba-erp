import { fetchApi, toQuery } from './client';
import { STORAGE_KEYS, storage } from './storage';
import type {
    Tenant,
    SaasDomain,
    OnboardingRequest,
    SaasPackage,
    SaasSubscription,
    SaasPayment,
    SaasBackup,
    SaasAuditLog,
    SaasDashboardOverview,
    SaasEmployee,
    FeatureMatrixResponse,
    Organization,
    OrganizationSummary,
    OrganizationMember,
    CreateOrganizationInput,
    CreateOrganizationWithFirstTenantInput,
    CreateOrganizationWithFirstTenantResult,
    PaginatedList,
} from './types';
import { asList } from './types';

function normalizeOverview(raw: unknown): SaasDashboardOverview {
    const r = (raw ?? {}) as Record<string, any>;
    const kpis = (r.kpis ?? {}) as Record<string, any>;
    const financial = (r.financial ?? {}) as Record<string, any>;
    const backups = (r.backups ?? {}) as Record<string, any>;
    const platform = (r.platform ?? {}) as Record<string, any>;
    return {
        total_tenants: kpis.total_tenants ?? r.total_tenants ?? 0,
        active_subscriptions: kpis.active_tenants ?? r.active_subscriptions ?? 0,
        mrr: financial.monthly_recurring_revenue ?? kpis.platform_mrr ?? r.mrr ?? 0,
        pending_onboarding: kpis.pending_requests ?? r.pending_onboarding ?? 0,
        total_revenue: financial.total_revenue_collected ?? r.total_revenue ?? 0,
        storage_used_bytes: backups.total_storage_mb ? backups.total_storage_mb * 1024 * 1024 : r.storage_used_bytes ?? 0,
        system_health: (String(platform.system_status ?? '').toLowerCase().includes('healthy') ? 'healthy' : 'warning') as 'healthy' | 'warning' | 'degraded',
        suspended_tenants: kpis.suspended_tenants,
        total_subscribers: kpis.total_subscribers,
        active_subscribers: kpis.active_subscribers,
        total_routers: kpis.total_routers,
        online_routers: kpis.online_routers,
        total_pops: kpis.total_pops,
        active_pops: kpis.active_pops,
        total_olts: kpis.total_olts,
        total_onus: kpis.total_onus,
        online_onus: kpis.online_onus,
        total_staff: kpis.total_staff,
        total_packages: kpis.total_packages,
        annual_run_rate: financial.annual_run_rate,
        cluster_status: r.cluster_status,
        redis_latency_ms: r.redis_latency_ms,
        sla_target: r.sla_target,
    };
}

function normalizeTenant(t: any): Tenant {
    const schema = t.schema_name || t.slug || '';
    const domain = t.domain_url || t.primary_domain || t.domain || `${schema || 'app'}.example.com`;
    return {
        id: String(t.id),
        name: t.name || '',
        schema_name: schema,
        domain_url: domain,
        plan: t.plan || 'Growth ISP Tier',
        contact_email: t.contact_email || '',
        contact_phone: t.contact_phone || '',
        address: t.address || '',
        is_active: Boolean(t.is_active),
        created_at: t.created_at || new Date().toISOString(),
        updated_at: t.updated_at || new Date().toISOString(),
        organization_id: t.organization_id ? String(t.organization_id) : null,
        organization_name: t.organization_name || null,
        organization_slug: t.organization_slug || null,
        subscription_status: t.subscription_status || (t.is_active ? 'active' : 'suspended'),
    } as Tenant;
}

function normalizeOrganization(o: any): OrganizationSummary {
    return {
        id: String(o.id),
        name: o.name || '',
        slug: o.slug || '',
        contact_phone: o.contact_phone || '',
        contact_email: o.contact_email || '',
        address: o.address || '',
        max_tenants: o.max_tenants ?? null,
        is_active: o.is_active !== undefined ? Boolean(o.is_active) : true,
        notes: o.notes || '',
        created_at: o.created_at || new Date().toISOString(),
        updated_at: o.updated_at || new Date().toISOString(),
        tenant_count: Number(o.tenant_count ?? 0),
        active_tenant_count: Number(o.active_tenant_count ?? 0),
        member_count: Number(o.member_count ?? 0),
        active_subscription_count: Number(o.active_subscription_count ?? 0),
        owner_email: o.owner_email ?? null,
    };
}

function normalizeOrganizationMember(m: any): OrganizationMember {
    return {
        id: String(m.id),
        organization: String(m.organization || ''),
        user: Number(m.user || 0),
        username: m.username || '',
        email: m.email || '',
        role: (m.role || 'MEMBER') as OrganizationMember['role'],
        is_active: m.is_active !== undefined ? Boolean(m.is_active) : true,
        invited_at: m.invited_at || new Date().toISOString(),
        accepted_at: m.accepted_at ?? null,
        updated_at: m.updated_at || new Date().toISOString(),
    };
}

function normalizeDomain(d: any): SaasDomain {
    return {
        id: String(d.id),
        domain: d.domain || d.hostname || '',
        tenant_id: String(d.tenant_id || d.tenant || ''),
        tenant_name: d.tenant_name || d.tenant_slug || '',
        is_primary: Boolean(d.is_primary),
        is_active: Boolean(d.is_active !== undefined ? d.is_active : d.verified),
        ssl_active: Boolean(d.ssl_active !== undefined ? d.ssl_active : d.verified),
        created_at: d.created_at,
    };
}

function normalizeOnboarding(r: any): OnboardingRequest {
    return {
        id: String(r.id),
        company_name: r.organization_name || r.company_name || '',
        email: r.contact_email || r.email || '',
        phone: r.contact_phone || r.phone || '',
        plan_requested: r.requested_plan || r.plan_requested || 'Starter ISP Tier',
        notes: r.notes || r.admin_notes || '',
        status: (r.status || 'pending').toLowerCase() as OnboardingRequest['status'],
        created_at: r.created_at || new Date().toISOString(),
        contact_name: r.contact_name || '',
        requested_slug: r.requested_slug || '',
        requested_domain: r.requested_domain || '',
        address: r.address || '',
        admin_notes: r.admin_notes || '',
    };
}

function normalizePackage(p: any): SaasPackage {
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
        subscriber_count: p.subscriber_count ?? p.subscribers_enrolled ?? 0,
    };
}

function normalizeSubscription(s: any): SaasSubscription {
    const status = (s.status === 'cancelled' ? 'canceled' : s.status || 'active').toLowerCase();
    return {
        id: String(s.id),
        tenant_id: String(s.tenant_id || s.tenant || ''),
        tenant_name: s.tenant_name || s.tenant_slug || '',
        package_id: String(s.package_id || s.package || ''),
        package_name: s.package_name || 'Standard Tier',
        status: status as SaasSubscription['status'],
        current_period_end: s.end_date || s.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
        created_at: s.created_at,
    };
}

function normalizePayment(p: any): SaasPayment {
    const st = String(p.status || '').toLowerCase();
    let mappedStatus: SaasPayment['status'] = 'succeeded';
    if (st.includes('completed') || st.includes('succeeded') || st.includes('success')) mappedStatus = 'succeeded';
    else if (st.includes('refund')) mappedStatus = 'refunded';
    else if (st.includes('fail')) mappedStatus = 'failed';
    else if (st.includes('pend')) mappedStatus = 'pending';
    return {
        id: String(p.id || p.trx_id || ''),
        subscription_id: String(p.subscription_id || p.subscription || ''),
        tenant_name: p.tenant_name || '',
        amount: Number(p.amount || 0),
        currency: p.currency || 'USD',
        payment_method: p.payment_method || 'bKash / MFS',
        status: mappedStatus,
        created_at: p.paid_at || p.created_at || new Date().toISOString(),
    };
}

function normalizeBackup(b: any): SaasBackup {
    let bt: SaasBackup['backup_type'] = 'full';
    if (b.backup_type === 'database_only' || b.backup_type === 'database') bt = 'database';
    else if (String(b.backup_type ?? '').includes('media')) bt = 'media';
    return {
        id: String(b.id || b.backup_name || ''),
        tenant_id: String(b.tenant || b.tenant_id || 'Global Platform'),
        tenant_name: b.tenant_name || b.backup_name || 'All Tenants',
        backup_type: bt,
        status: b.status === 'completed' ? 'completed' : b.status === 'failed' ? 'failed' : 'in_progress',
        size_bytes: Number(b.file_size_bytes || b.size_bytes || 0),
        created_at: b.created_at || new Date().toISOString(),
    };
}

function normalizeAuditLog(l: any): SaasAuditLog {
    return {
        id: String(l.id),
        action: l.action || 'system.event',
        user_id: l.actor_username || l.user_id || 'admin@sheba.app',
        tenant_id: l.tenant_name || l.tenant_slug || (l.tenant ? String(l.tenant) : ''),
        details: (l.details ?? {}) as Record<string, unknown>,
        ip_address: l.ip_address || '127.0.0.1',
        created_at: l.timestamp || l.created_at || new Date().toISOString(),
    };
}

function normalizeEmployee(e: any): SaasEmployee {
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

export const saasApi = {
    /* Auth */
    login: async (credentials: { username?: string; email?: string; password: string }) => {
        const payload = { username: credentials.username || credentials.email, password: credentials.password };
        const res = await fetchApi<{ token: string; user?: any; message?: string }>('/auth/login', {
            method: 'POST',
            json: payload,
            plane: 'central',
        });
        if (res?.token && typeof window !== 'undefined') {
            storage.set(STORAGE_KEYS.centralToken, res.token);
            if (res.user) storage.setJSON(STORAGE_KEYS.centralUser, res.user);
        }
        return res;
    },
    me: () =>
        fetchApi<any>('/auth/me', { plane: 'central' }).then(res => ({
            email: res.email || 'admin@sheba.local',
            name: res.username || res.name || res.full_name || 'System Administrator',
            role: res.role || 'Platform Super Admin',
            ...res,
        })),
    logout: async () => {
        try {
            await fetchApi('/auth/logout', { method: 'POST', plane: 'central' });
        } catch {
            /* ignore */
        }
        if (typeof window !== 'undefined') {
            storage.remove(STORAGE_KEYS.centralToken);
            storage.remove(STORAGE_KEYS.centralUser);
        }
        return { success: true };
    },
    requestPasswordReset: (email: string) =>
        fetchApi<{ detail: string }>('/auth/password-reset', {
            method: 'POST',
            json: { email: (email || '').trim().toLowerCase() },
            plane: 'central',
            skipAuth: true,
        }),
    confirmPasswordReset: (uid: string, newPassword: string, token: string) =>
        fetchApi<{ detail: string }>('/auth/password-reset-confirm', {
            method: 'POST',
            json: { uid, token, new_password: newPassword },
            plane: 'central',
            skipAuth: true,
        }),

    /* Overview */
    getDashboardOverview: () => fetchApi<any>('/overview', { plane: 'central' }).then(normalizeOverview),

    /* Tenants */
    getTenants: (params?: Record<string, string>) =>
        fetchApi<PaginatedList<any>>(`/tenants${toQuery(params)}`, { plane: 'central' }).then(r => asList<any>(r).map(normalizeTenant)),
    getTenant: (id: string) => fetchApi<any>(`/tenants/${id}`, { plane: 'central' }).then(normalizeTenant),
    createTenant: (data: Partial<Tenant>) => {
        const slug = data.schema_name || (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
        const payload: Record<string, unknown> = {
            name: data.name,
            slug,
            domain: data.domain_url || `${slug}.example.com`,
            plan: data.plan || 'Growth ISP Tier',
        };
        if (data.contact_email) payload.contact_email = data.contact_email;
        if (data.contact_phone) payload.contact_phone = data.contact_phone;
        if (data.address) payload.address = data.address;
        if (data.is_active !== undefined) payload.is_active = data.is_active;
        if (data.organization_id) payload.organization_id = data.organization_id;
        return fetchApi<any>('/tenants', { method: 'POST', json: payload, plane: 'central' }).then(normalizeTenant);
    },
    updateTenant: (id: string, data: Partial<Tenant>) => {
        const payload: Record<string, unknown> = { ...data };
        if (data.schema_name) payload.slug = data.schema_name;
        if (data.domain_url) payload.domain = data.domain_url;
        return fetchApi<any>(`/tenants/${id}`, { method: 'PATCH', json: payload, plane: 'central' }).then(normalizeTenant);
    },
    toggleTenantStatus: (id: string) => fetchApi<any>(`/tenants/${id}/toggle-status`, { method: 'POST', plane: 'central' }).then(normalizeTenant),
    deleteTenant: (id: string) => fetchApi<void>(`/tenants/${id}`, { method: 'DELETE', plane: 'central' }),
    moveTenantToOrganization: (tenantId: string, organizationId: string | null) =>
        fetchApi<any>(`/tenants/${tenantId}/move-to-organization/`, {
            method: 'POST',
            json: { organization_id: organizationId },
            plane: 'central',
        }).then(normalizeTenant),

    /* Organizations (parent of tenants) */
    getOrganizations: (params?: Record<string, string>) =>
        fetchApi<PaginatedList<any>>(`/organizations${toQuery(params)}`, { plane: 'central' }).then(r =>
            asList<any>(r).map(normalizeOrganization),
        ),
    getOrganization: (id: string) =>
        fetchApi<any>(`/organizations/${id}`, { plane: 'central' }).then(normalizeOrganization),
    createOrganization: (data: CreateOrganizationInput) => {
        const payload: Record<string, unknown> = { ...data };
        return fetchApi<any>('/organizations', { method: 'POST', json: payload, plane: 'central' }).then(normalizeOrganization);
    },
    updateOrganization: (id: string, data: Partial<CreateOrganizationInput>) =>
        fetchApi<any>(`/organizations/${id}`, { method: 'PATCH', json: data, plane: 'central' }).then(normalizeOrganization),
    deleteOrganization: (id: string) => fetchApi<void>(`/organizations/${id}`, { method: 'DELETE', plane: 'central' }),
    createOrganizationWithFirstTenant: (data: CreateOrganizationWithFirstTenantInput) => {
        const payload: Record<string, unknown> = { ...data };
        return fetchApi<any>('/organizations/create-with-first-tenant/', {
            method: 'POST',
            json: payload,
            plane: 'central',
        }).then(res => {
            if (res && res.organization) {
                return {
                    ...(res as CreateOrganizationWithFirstTenantResult),
                    organization: normalizeOrganization(res.organization),
                    owner_membership: normalizeOrganizationMember(res.owner_membership),
                } as CreateOrganizationWithFirstTenantResult;
            }
            return res as CreateOrganizationWithFirstTenantResult;
        });
    },
    getOrganizationMembers: (id: string) =>
        fetchApi<PaginatedList<any>>(`/organizations/${id}/members/`, { plane: 'central' }).then(r =>
            asList<any>(r).map(normalizeOrganizationMember),
        ),
    upsertOrganizationMember: (id: string, body: { username: string; role: string; is_active?: boolean }) =>
        fetchApi<any>(`/organizations/${id}/members/`, { method: 'POST', json: body, plane: 'central' }).then(normalizeOrganizationMember),
    removeOrganizationMember: (id: string, userId: string | number) =>
        fetchApi<void>(`/organizations/${id}/members/${userId}/`, { method: 'DELETE', plane: 'central' }),
    resetOrganizationMemberPassword: (orgId: string, userId: string | number) =>
        fetchApi<{ sent: boolean; recipient?: string; username?: string; message?: string }>(
            `/organizations/${orgId}/reset-member-password/${userId}/`,
            { method: 'POST', plane: 'central' },
        ),
    getOrganizationTenants: (id: string) =>
        fetchApi<{ count: number; results: any[] }>(`/organizations/${id}/tenants/`, { plane: 'central' }),

    /* Domains */
    getDomains: () => fetchApi<PaginatedList<any>>('/domains', { plane: 'central' }).then(r => asList<any>(r).map(normalizeDomain)),
    createDomain: (data: Partial<SaasDomain>) =>
        fetchApi<any>('/domains', {
            method: 'POST',
            json: { hostname: data.domain, tenant: data.tenant_id, is_primary: data.is_primary ?? false, is_active: data.is_active ?? true },
            plane: 'central',
        }).then(normalizeDomain),
    verifyDomain: (id: string) => fetchApi<any>(`/domains/${id}/toggle-verify`, { method: 'POST', plane: 'central' }).then(normalizeDomain),
    setPrimaryDomain: (id: string) => fetchApi<any>(`/domains/${id}`, { method: 'PATCH', json: { is_primary: true }, plane: 'central' }).then(normalizeDomain),
    deleteDomain: (id: string) => fetchApi<void>(`/domains/${id}`, { method: 'DELETE', plane: 'central' }),

    /* Onboarding */
    getOnboardingRequests: () => fetchApi<PaginatedList<any>>('/requests', { plane: 'central' }).then(r => asList<any>(r).map(normalizeOnboarding)),
    approveOnboarding: (id: string) => fetchApi<any>(`/requests/${id}/approve`, { method: 'POST', plane: 'central' }),
    rejectOnboarding: (id: string, reason?: string) =>
        fetchApi<any>(`/requests/${id}/reject`, {
            method: 'POST',
            json: { reason: reason || 'Application rejected by platform administrator.' },
            plane: 'central',
        }),
    notifyOnboarding: (id: string, payload: { claim_url?: string; admin_password?: string } = {}) =>
        fetchApi<{ sent: boolean; recipient: string; channel: string; admin_username: string; claim_url: string; audit_log_id: string; message: string }>(
            `/requests/${id}/notify`,
            { method: 'POST', json: payload, plane: 'central' },
        ),

    /* Packages & subscriptions */
    getPackages: () => fetchApi<PaginatedList<any>>('/packages', { plane: 'central' }).then(r => asList<any>(r).map(normalizePackage)),
    createPackage: (data: Partial<SaasPackage>) => {
        const payload = {
            name: data.name,
            code: ((data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-') || `pkg-${Date.now()}`),
            monthly_price: data.price,
            yearly_price: (data.price || 0) * 10,
            features: data.features || [],
            is_active: data.is_active !== undefined ? data.is_active : true,
        };
        return fetchApi<any>('/packages', { method: 'POST', json: payload, plane: 'central' }).then(normalizePackage);
    },
    updatePackage: (id: string, data: Partial<SaasPackage>) => {
        const payload: Record<string, unknown> = {};
        if (data.name !== undefined) payload.name = data.name;
        if (data.price !== undefined) payload.monthly_price = data.price;
        if (data.features !== undefined) payload.features = data.features;
        if (data.is_active !== undefined) payload.is_active = data.is_active;
        return fetchApi<any>(`/packages/${id}`, { method: 'PATCH', json: payload, plane: 'central' }).then(normalizePackage);
    },
    deletePackage: (id: string) => fetchApi<void>(`/packages/${id}`, { method: 'DELETE', plane: 'central' }),

    getSubscriptions: () => fetchApi<PaginatedList<any>>('/subscriptions', { plane: 'central' }).then(r => asList<any>(r).map(normalizeSubscription)),
    cancelSubscription: (id: string) => fetchApi<any>(`/subscriptions/${id}/cancel`, { method: 'POST', plane: 'central' }),

    /* Payments */
    getPayments: () => fetchApi<PaginatedList<any>>('/payments', { plane: 'central' }).then(r => asList<any>(r).map(normalizePayment)),
    refundPayment: (id: string) => fetchApi<any>(`/payments/${id}/refund`, { method: 'POST', plane: 'central' }).then(normalizePayment),

    /* Backups */
    getBackups: () => fetchApi<PaginatedList<any>>('/backups', { plane: 'central' }).then(r => asList<any>(r).map(normalizeBackup)),
    createBackup: (tenantId: string, backupType: 'full' | 'database' | 'media' = 'full') => {
        const payload: Record<string, unknown> = {
            name: `Snapshot - ${new Date().toISOString().slice(0, 16)}`,
            backup_type: backupType === 'database' ? 'database_only' : 'full_database',
        };
        if (tenantId && tenantId !== 'all') payload.tenant = tenantId;
        return fetchApi<any>('/backups/create-backup', { method: 'POST', json: payload, plane: 'central' }).then(res =>
            normalizeBackup(res?.backup ?? res),
        );
    },
    deleteBackup: (id: string) => fetchApi<void>(`/backups/${id}`, { method: 'DELETE', plane: 'central' }),

    /* Audit logs */
    getAuditLogs: () => fetchApi<PaginatedList<any>>('/audit-logs', { plane: 'central' }).then(r => asList<any>(r).map(normalizeAuditLog)),
    logAction: async (action: string, details: Record<string, unknown>, tenantId?: string) => {
        try {
            await fetchApi('/audit-logs', {
                method: 'POST',
                json: { action, details, tenant_id: tenantId },
                plane: 'central',
            });
        } catch {
            /* ignore */
        }
    },

    /* Employees */
    getEmployees: (params?: Record<string, string>) =>
        fetchApi<PaginatedList<any>>(`/employees${toQuery(params)}`, { plane: 'central' }).then(r => asList<any>(r).map(normalizeEmployee)),
    createEmployee: (data: Partial<SaasEmployee>) => fetchApi<any>('/employees', { method: 'POST', json: data, plane: 'central' }).then(normalizeEmployee),
    updateEmployee: (id: string | number, data: Partial<SaasEmployee>) =>
        fetchApi<any>(`/employees/${id}`, { method: 'PATCH', json: data, plane: 'central' }).then(normalizeEmployee),
    deleteEmployee: (id: string | number) => fetchApi<void>(`/employees/${id}`, { method: 'DELETE', plane: 'central' }),

    /* Feature matrix */
    getFeatureMatrix: () => fetchApi<FeatureMatrixResponse>('/feature-matrix', { plane: 'central' }),

    /* Health */
    getPlatformHealth: () => fetchApi<Record<string, unknown>>('/health', { plane: 'central' }),

    /* ISP owner surface */
    getMyOrganizations: () => fetchApi<{ count: number; items: any[] }>('/organizations/me/', { plane: 'central' }),
};