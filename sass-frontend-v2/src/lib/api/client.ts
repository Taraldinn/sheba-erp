import { ApiError, NetworkError, type ApiErrorBody } from '../errors';
import { getApiBaseUrls, type Plane } from './config';
import { STORAGE_KEYS, storage, UNAUTHORIZED_EVENT } from './storage';

export type TokenSlot = 'centralToken' | 'tenantToken' | 'resellerToken' | 'portalToken';

const STORAGE_KEY_BY_SLOT: Record<TokenSlot, string> = {
    centralToken: STORAGE_KEYS.centralToken,
    tenantToken: STORAGE_KEYS.tenantToken,
    resellerToken: STORAGE_KEYS.resellerToken,
    portalToken: STORAGE_KEYS.portalToken,
};

export interface FetchOptions extends Omit<RequestInit, 'signal' | 'body'> {
    plane?: Plane;
    tokenSlot?: TokenSlot;
    skipAuth?: boolean;
    tenantSlug?: string;
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
    /** Body to be JSON-serialized (set as JSON Content-Type). */
    json?: unknown;
    /** Body that is already a string/FormData. */
    body?: BodyInit | null;
    /** Extra timeout in ms (default 30s). */
    timeoutMs?: number;
    /** Idempotency key for safe financial retries. */
    idempotencyKey?: string;
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

function readToken(slot: TokenSlot): string | null {
    return storage.get(STORAGE_KEY_BY_SLOT[slot]);
}

function readTenantSlug(opts: FetchOptions): string | null {
    if (opts.tenantSlug) return opts.tenantSlug;
    if (typeof window !== 'undefined') {
        const host = window.location.hostname.toLowerCase();
        if (host.endsWith('.localhost')) {
            const sub = host.replace(/\.localhost$/, '');
            if (sub && sub !== 'admin' && sub !== 'app' && sub !== 'saas' && sub !== 'control') {
                return sub;
            }
        }
    }
    return storage.get(STORAGE_KEYS.tenantSlug);
}

function buildHeaders(token: string | null, opts: FetchOptions): Headers {
    const h = new Headers();
    h.set('Accept', 'application/json');
    if (opts.json !== undefined) {
        h.set('Content-Type', 'application/json');
    } else if (opts.body && !(opts.body instanceof FormData)) {
        if (!h.has('Content-Type')) h.set('Content-Type', 'application/json');
    }
    if (opts.idempotencyKey) {
        h.set('Idempotency-Key', opts.idempotencyKey);
    }
    if (token && !opts.skipAuth && !isAuthEndpoint(opts.signal ? '' : '')) {
        // Headers applied below; here we only set if not auth endpoint.
    }
    if (token && !opts.skipAuth && !isAuthEndpoint('')) {
        h.set('Authorization', token.startsWith('Token ') || token.startsWith('Bearer ') ? token : `Token ${token}`);
    }
    const slug = readTenantSlug(opts);
    if (slug && (opts.plane ?? 'tenant') === 'tenant') {
        h.set('X-Tenant-ID', slug);
    }
    if (opts.headers) {
        const extra = new Headers(opts.headers as HeadersInit);
        extra.forEach((v, k) => h.set(k, v));
    }
    return h;
}

function dispatchUnauthorized(): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
}

async function parseErrorBody(res: Response): Promise<{ message: string; code?: string; controlPlaneUrl?: string; fieldErrors?: Record<string, string[]> }> {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            const data = (await res.json()) as ApiErrorBody;
            return {
                message: data.detail || data.message || data.error || JSON.stringify(data),
                code: data.code || data.error,
                controlPlaneUrl: data.control_plane_url,
                fieldErrors: data.field_errors,
            };
        } catch {
            /* fall through */
        }
    } else if (contentType.includes('text/html')) {
        await res.text();
        if (res.status === 403) {
            return { message: 'The backend rejected the request (HTTP 403). CORS or CSRF may be blocking this origin.' };
        }
        if (res.status >= 500) {
            return { message: `Backend server error (HTTP ${res.status}).` };
        }
        return { message: `Backend returned an HTML response instead of JSON (HTTP ${res.status}).` };
    }
    try {
        return { message: await res.text() };
    } catch {
        return { message: `API request failed with status ${res.status}` };
    }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new ApiError(0, `Request timed out after ${ms}ms`)), ms);
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

export interface FetchApiResult<T> {
    data: T;
    requestId?: string;
}

/**
 * Typed API client.
 *
 * - Routes requests by plane (`central` -> `/saas/...`, `tenant` -> `/...`).
 * - Injects token from the slot-scoped storage key.
 * - Supports AbortSignal, idempotency keys, and a request timeout.
 * - Normalizes backend error envelopes into `ApiError`.
 * - On 401, dispatches a `sheba:unauthorized` window event so the auth
 *   provider can clear state and route to the login screen.
 */
export async function fetchApi<T = unknown>(endpoint: string, opts: FetchOptions = {}): Promise<T> {
    const plane: Plane = opts.plane ?? 'tenant';
    const slot: TokenSlot =
        opts.tokenSlot ??
        (plane === 'central'
            ? 'centralToken'
            : plane === 'public'
                ? 'tenantToken'
                : 'tenantToken');
    const baseUrl = resolveBaseUrl(plane);
    const fullUrl = `${baseUrl}${normalizeEndpoint(endpoint)}`;
    const skipAuth = opts.skipAuth === true || isAuthEndpoint(endpoint);
    const timeoutMs = opts.timeoutMs ?? 30_000;

    const token = skipAuth ? null : readToken(slot);

    const headers = buildHeaders(token, opts);

    const init: RequestInit = {
        method: opts.method ?? (opts.json !== undefined || opts.body ? 'POST' : 'GET'),
        headers,
        credentials: 'include',
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.json !== undefined ? { body: JSON.stringify(opts.json) } : {}),
    };
    if (opts.signal) init.signal = opts.signal;

    let response: Response;
    try {
        response = await withTimeout(fetch(fullUrl, init), timeoutMs);
    } catch (e) {
        if (e instanceof ApiError) throw e;
        if (e instanceof Error && e.name === 'AbortError') throw e;
        throw new NetworkError(`Cannot reach ${fullUrl}: ${(e as Error).message ?? 'network error'}`);
    }

    if (response.status === 204) return undefined as T;

    if (!response.ok) {
        const { message, code, controlPlaneUrl, fieldErrors } = await parseErrorBody(response);
        const apiErr = new ApiError(response.status, message, { code, controlPlaneUrl, fieldErrors });
        if (apiErr.isAuthError() && !skipAuth) {
            dispatchUnauthorized();
        }
        throw apiErr;
    }

    // 2xx with empty body
    const contentLength = response.headers.get('content-length');
    if (contentLength === '0') return undefined as T;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        // Successful HTML response is a misconfiguration; surface clearly.
        throw new ApiError(response.status, `Expected JSON but received ${contentType || 'unknown'}`);
    }

    return (await response.json()) as T;
}

/** Helper: build a query string from an object. */
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

export const apiUtils = {
    normalizeEndpoint,
    isAuthEndpoint,
    toQuery,
};