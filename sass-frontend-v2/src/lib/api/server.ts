import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

import { getApiBaseUrls, type Plane } from './config';
import { STORAGE_KEYS } from './storage';
import type {
    Tenant,
    SaasDashboardOverview,
    OrganizationSummary,
    PaginatedList,
} from './types';
import { asList } from './types';

const SLOT_COOKIE: Record<'centralToken' | 'tenantToken' | 'resellerToken' | 'portalToken', string> = {
    centralToken: STORAGE_KEYS.centralToken,
    tenantToken: STORAGE_KEYS.tenantToken,
    resellerToken: STORAGE_KEYS.resellerToken,
    portalToken: STORAGE_KEYS.portalToken,
};

export type TokenSlot = keyof typeof SLOT_COOKIE;

export interface ServerFetchOptions extends Omit<RequestInit, 'signal' | 'body'> {
    plane?: Plane;
    tokenSlot?: TokenSlot;
    skipAuth?: boolean;
    tenantSlug?: string;
    json?: unknown;
    body?: BodyInit | null;
    timeoutMs?: number;
    /** Next.js revalidate hint forwarded to fetch. */
    next?: { revalidate?: number | false; tags?: string[] };
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
}

function resolveBaseUrl(plane: Plane): string {
    const urls = getApiBaseUrls();
    if (plane === 'central') return urls.central;
    if (plane === 'public') return urls.public;
    return urls.tenant;
}

function normalizeEndpoint(endpoint: string): string {
    const [path, query = ''] = endpoint.split('?');
    const cleanPath = path && !path.endsWith('/') ? `${path}/` : path || '/';
    return query ? `${cleanPath}?${query}` : cleanPath;
}

async function readTokenFromCookies(slot: TokenSlot): Promise<string | null> {
    try {
        const jar = await cookies();
        const value = jar.get(SLOT_COOKIE[slot])?.value;
        return value || null;
    } catch {
        return null;
    }
}

async function readTenantSlug(opts: ServerFetchOptions): Promise<string | null> {
    if (opts.tenantSlug) return opts.tenantSlug;
    try {
        const jar = await cookies();
        const slug = jar.get(STORAGE_KEYS.tenantSlug)?.value;
        return slug || null;
    } catch {
        return null;
    }
}

function isAuthEndpoint(endpoint: string): boolean {
    const p = endpoint.split('?')[0];
    return (
        p.startsWith('/auth/login') ||
        p.startsWith('/auth/logout') ||
        p.startsWith('/auth/password-reset') ||
        p.startsWith('/auth/password-reset-confirm') ||
        p.startsWith('/auth/reseller/login') ||
        p.startsWith('/tenants/resolve')
    );
}

function buildHeaders(token: string | null, opts: ServerFetchOptions, slug: string | null): Headers {
    const h = new Headers();
    h.set('Accept', 'application/json');
    if (opts.json !== undefined) {
        h.set('Content-Type', 'application/json');
    } else if (opts.body && !(opts.body instanceof FormData)) {
        if (!h.has('Content-Type')) h.set('Content-Type', 'application/json');
    }
    if (token && !opts.skipAuth && !isAuthEndpoint('')) {
        h.set(
            'Authorization',
            token.startsWith('Token ') || token.startsWith('Bearer ') || token.startsWith('Session ')
                ? token
                : `Token ${token}`,
        );
    }
    if (slug && (opts.plane ?? 'tenant') === 'tenant') {
        h.set('X-Tenant-ID', slug);
    }
    if (opts.headers) {
        const extra = new Headers(opts.headers as HeadersInit);
        extra.forEach((v, k) => h.set(k, v));
    }
    return h;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
        promise.then(
            v => {
                clearTimeout(t);
                resolve(v);
            },
            e => {
                clearTimeout(t);
                reject(e);
            },
        );
    });
}

export class ServerApiError extends Error {
    status: number;
    code?: string;
    fieldErrors?: Record<string, string[]>;

    constructor(status: number, message: string, extra: { code?: string; fieldErrors?: Record<string, string[]> } = {}) {
        super(message);
        this.name = 'ServerApiError';
        this.status = status;
        this.code = extra.code;
        this.fieldErrors = extra.fieldErrors;
    }
}

async function parseErrorBody(res: Response): Promise<{ message: string; code?: string; fieldErrors?: Record<string, string[]> }> {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            const data = (await res.json()) as {
                detail?: string;
                message?: string;
                error?: string;
                code?: string;
                field_errors?: Record<string, string[]>;
            };
            return {
                message: data.detail || data.message || data.error || JSON.stringify(data),
                code: data.code || data.error,
                fieldErrors: data.field_errors,
            };
        } catch {
            /* fall through */
        }
    }
    try {
        return { message: await res.text() };
    } catch {
        return { message: `API request failed with status ${res.status}` };
    }
}

export async function serverFetch<T = unknown>(endpoint: string, opts: ServerFetchOptions = {}): Promise<T> {
    const plane: Plane = opts.plane ?? 'tenant';
    const slot: TokenSlot =
        opts.tokenSlot ?? (plane === 'central' ? 'centralToken' : 'tenantToken');
    const baseUrl = resolveBaseUrl(plane);
    const fullUrl = `${baseUrl}${normalizeEndpoint(endpoint)}`;
    const skipAuth = opts.skipAuth === true || isAuthEndpoint(endpoint);
    const timeoutMs = opts.timeoutMs ?? 30_000;

    const token = skipAuth ? null : await readTokenFromCookies(slot);
    const slug = await readTenantSlug(opts);
    const headers = buildHeaders(token, opts, slug);

    const init: RequestInit & { next?: { revalidate?: number | false; tags?: string[] } } = {
        method: opts.method ?? (opts.json !== undefined || opts.body ? 'POST' : 'GET'),
        headers,
        credentials: 'include',
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.json !== undefined ? { body: JSON.stringify(opts.json) } : {}),
    };
    if (opts.next) init.next = opts.next;
    if (opts.signal) init.signal = opts.signal;

    let response: Response;
    try {
        response = await withTimeout(fetch(fullUrl, init), timeoutMs);
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e;
        throw new Error(`Cannot reach ${fullUrl}: ${(e as Error).message ?? 'network error'}`);
    }

    if (response.status === 204) return undefined as T;

    if (!response.ok) {
        const { message, code, fieldErrors } = await parseErrorBody(response);
        throw new ServerApiError(response.status, message, { code, fieldErrors });
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength === '0') return undefined as T;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new ServerApiError(response.status, `Expected JSON but received ${contentType || 'unknown'}`);
    }

    return (await response.json()) as T;
}

export function toQuery(params: Record<string, unknown> | undefined | null): string {
    if (!params) return '';
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === '') continue;
        search.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
}

/* ── Normalizers (server-side mirrors of saas.ts) ─────────────────────── */

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
    };
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

/* ── Server-side SaaS reads (cached per request) ──────────────────────── */

export const getDashboardOverviewServer = cache(async (): Promise<SaasDashboardOverview> => {
    const raw = await serverFetch<any>('/overview', {
        plane: 'central',
        next: { revalidate: 30, tags: ['saas:overview'] },
    });
    return normalizeOverview(raw);
});

export interface TenantsQuery {
    page?: number | string;
    search?: string;
    is_active?: string;
    plan?: string;
    organization?: string;
}

export interface TenantsResult {
    items: Tenant[];
    count: number;
    next: string | null;
    previous: string | null;
}

export const getTenantsServer = cache(async (params: TenantsQuery = {}): Promise<TenantsResult> => {
    const query: Record<string, string> = {};
    if (params.page) query.page = String(params.page);
    if (params.search) query.search = params.search;
    if (params.is_active) query.is_active = params.is_active;
    if (params.plan) query.plan = params.plan;
    if (params.organization) query.organization = params.organization;
    const raw = await serverFetch<PaginatedList<any>>(`/tenants${toQuery(query)}`, {
        plane: 'central',
        next: { revalidate: 15, tags: ['saas:tenants'] },
    });
    const list = asList<any>(raw);
    const items = list.map(normalizeTenant);
    if (Array.isArray(raw)) {
        return { items, count: items.length, next: null, previous: null };
    }
    return {
        items,
        count: raw.count ?? items.length,
        next: raw.next ?? null,
        previous: raw.previous ?? null,
    };
});

export const getOrganizationsServer = cache(async (params: Record<string, string> = {}): Promise<OrganizationSummary[]> => {
    const raw = await serverFetch<PaginatedList<any>>(`/organizations${toQuery(params)}`, {
        plane: 'central',
        next: { revalidate: 60, tags: ['saas:organizations'] },
    });
    return asList<any>(raw).map(normalizeOrganization);
});
