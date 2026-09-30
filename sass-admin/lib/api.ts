/**
 * Lightweight typed fetch wrapper around the Sheba SaaS Control Plane API.
 *
 * Auth: SaaS login returns an opaque `session_token` + a legacy DRF `token`.
 * We send it as `Authorization: Session <session_token>` because
 * `apps/authentication/sessions.py` resolves that scheme server-side
 * (see SESSION_AUTH_SCHEME = "Session"). The `sheba_session` httpOnly cookie
 * is set by the login response and travels automatically on same-origin calls.
 *
 * For client-side calls we read the token from localStorage so the
 * browser keeps the session across refreshes.
 */
export const SESSION_STORAGE_KEY = "sheba_saas_session_token";

export type ApiFetchOptions = RequestInit & {
  /** Override auth token (defaults to localStorage). */
  token?: string | null;
  /** Send a query string explicitly (when not using fetch's URL). */
  query?: Record<string, string | number | boolean | undefined | null>;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Returns the SaaS control-plane base URL (`<api>/api/v1/saas`). Exported
 * so helpers like `lib/report-error.ts` can post to `/audit-logs/`.
 */
export function getApiBase(): string {
  // SaaS control plane sits under <api>/saas/. NB: NEXT_PUBLIC_API_URL
  // already includes /api/v1 for the operator frontend, so we strip it off
  // and re-add /api/v1/saas.
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

  return raw.replace(/\/api\/v1\/?$/, "") + "/api/v1/saas";
}

export const SESSION_COOKIE_NAME = "sheba_session";

/**
 * Legacy dev-mode auto-login bypass. Left here only so local dev
 * (without an explicit `NEXT_PUBLIC_DEV_SESSION_TOKEN` env var) still
 * works without a manual login dance. **Disabled in production** —
 * a hard-coded token in the bundle would be a security hole.
 *
 * See sass-admin/task.md T-01: dev-only shortcuts removed for v1.
 */
function getDevFallbackToken(): string | null {
  if (process.env.NODE_ENV === "production") return null;

  return (
    process.env.NEXT_PUBLIC_DEV_SESSION_TOKEN ??
    process.env.NEXT_PUBLIC_SAAS_DEV_TOKEN ??
    null
  );
}

/**
 * Returns the SaaS admin session token from localStorage / cookies, or
 * the dev fallback (only when not in production). Exported so helpers
 * like `lib/report-error.ts` can attribute reports to a session.
 */
export function getStoredToken(): string | null {
  try {
    if (typeof window === "undefined") {
      // Server-side: the caller (route handler / server component /
      // guard) is responsible for reading the cookie and passing the
      // token in. We never return a dev fallback here — server requests
      // are always authenticated explicitly.
      return null;
    }

    const fromStorage = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (fromStorage) return fromStorage;
    const match = document.cookie.match(
      new RegExp(
        `(?:^|;\\s*)(${SESSION_STORAGE_KEY}|${SESSION_COOKIE_NAME})=([^;]*)`,
      ),
    );

    if (match && match[2]) return decodeURIComponent(match[2]);

    return getDevFallbackToken();
  } catch {
    return getDevFallbackToken();
  }
}

export function storeSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
      const expires = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toUTCString();

      document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax`;
      document.cookie = `${SESSION_STORAGE_KEY}=${encodeURIComponent(token)}; expires=${expires}; path=/; SameSite=Lax`;
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      try {
        window.localStorage.removeItem("sheba_saas_legacy_token");
      } catch {
        /* ignore */
      }
      document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
      document.cookie = `${SESSION_STORAGE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
    }
  } catch {
    /* ignore */
  }
}

export async function syncSessionCookie(token: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    /* ignore network errors to fallback on document.cookie */
  }
}

function buildUrl(path: string, query?: ApiFetchOptions["query"]): string {
  const base = getApiBase();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  let url = `${base}${cleanPath}`;

  if (query) {
    const params = new URLSearchParams();

    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.append(k, String(v));
    }
    const qs = params.toString();

    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  return url;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { token, query, headers, ...rest } = options;
  const authToken = token === undefined ? getStoredToken() : token;
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (rest.body && !finalHeaders["Content-Type"]) {
    finalHeaders["Content-Type"] = "application/json";
  }
  if (authToken) {
    finalHeaders["Authorization"] = `Session ${authToken}`;
  }
  const url = buildUrl(path, query);
  const res = await fetch(url, { ...rest, headers: finalHeaders });

  // T-31 surface: when the (future) BFF replays an idempotent response, it
  // tags the response with `Idempotency-Replay: true`. We bubble that flag
  // up via a custom event so the UI can show a "deduped" toast.
  if (
    res.headers.get("idempotency-replay") === "true" &&
    typeof window !== "undefined"
  ) {
    window.dispatchEvent(
      new CustomEvent("sheba:idempotency-replay", {
        detail: { path, status: res.status },
      }),
    );
  }

  const contentType = res.headers.get("content-type") ?? "";
  let body: unknown = null;

  if (contentType.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;

    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

export const api = {
  get: <T = unknown>(path: string, query?: ApiFetchOptions["query"]) =>
    apiFetch<T>(path, { method: "GET", query }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
      headers: { "Idempotency-Key": newIdempotencyKey() },
    }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body ?? {}),
      headers: { "Idempotency-Key": newIdempotencyKey() },
    }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PUT",
      body: JSON.stringify(body ?? {}),
      headers: { "Idempotency-Key": newIdempotencyKey() },
    }),
  delete: <T = unknown>(path: string) =>
    apiFetch<T>(path, {
      method: "DELETE",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    }),
};

/**
 * Generates a per-request idempotency key for non-GET requests. The
 * browser's `crypto.randomUUID()` is used; on the server Node 19+ also
 * exposes `crypto.randomUUID()`. We swallow the (theoretically
 * impossible) absence of either by returning a timestamp-based fallback
 * so the request still goes through.
 *
 * Ref: sass-admin/task.md T-30. When the BFF lands (Phase 4), it will
 * store `(key → response)` in CF KV and replay on duplicate keys — the
 * header just needs to be present and stable across retries from the
 * same call site.
 */
function newIdempotencyKey(): string {
  try {
    return (
      (globalThis.crypto &&
        globalThis.crypto.randomUUID &&
        globalThis.crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    );
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

// ---------------------------------------------------------------------------
// SaaS Control Plane API surface
//
// All endpoints live under `${getApiBase()}/…` which resolves to
// `${NEXT_PUBLIC_API_URL}/api/v1/saas`. The backend enforces
// `IsCentralAdmin` on every route here — these calls are 403 for any
// non-platform-superuser token.
//
// Typed against `lib/types.ts` (SaaSControlPlaneOverview, etc.). When
// T-11/T-13 land (openapi-typescript), these types are replaced with
// generated ones and the hand-rolled ones are kept as aliases for
// backward compatibility.
// ---------------------------------------------------------------------------

/** GET /overview/ — platform-wide KPIs. */
function getOverview<T = unknown>(): Promise<T> {
  return api.get<T>("/overview/");
}

/** GET /health/ — DB/Redis/totals health snapshot. */
function getPlatformHealth<T = unknown>(): Promise<T> {
  return api.get<T>("/health/");
}

/** GET /tenants/ — paginated list, returns `{count, next, previous, results}`. */
function listTenants<T = unknown>(query?: {
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
}) {
  return api.get<T>("/tenants/", query);
}

/** GET /tenants/{id}/telemetry/ — per-tenant operational metrics. */
function getTenantTelemetry<T = unknown>(tenantId: string | number) {
  return api.get<T>(`/tenants/${tenantId}/telemetry/`);
}

/** POST /tenants/bulk-suspend/ — suspend multiple tenants. */
function bulkSuspendTenants<T = unknown>(tenantIds: Array<string | number>) {
  return api.post<T>("/tenants/bulk-suspend/", { tenant_ids: tenantIds });
}

/** POST /tenants/bulk-activate/ — reactivate multiple tenants. */
function bulkActivateTenants<T = unknown>(tenantIds: Array<string | number>) {
  return api.post<T>("/tenants/bulk-activate/", { tenant_ids: tenantIds });
}

/** POST /tenants/{id}/toggle-status/ — flip a single tenant's `is_active`. */
function toggleTenantStatus<T = unknown>(tenantId: string | number) {
  return api.post<T>(`/tenants/${tenantId}/toggle-status/`);
}

/** POST /tenants/{id}/impersonate/ — issue a session for an admin of the tenant. */
function impersonateTenant<T = unknown>(tenantId: string | number) {
  return api.post<T>(`/tenants/${tenantId}/impersonate/`);
}

/** GET /audit-logs/ — paginated global audit trail. */
function listAuditLogs<T = unknown>(query?: {
  tenant_slug?: string;
  action?: string;
  module?: string;
  actor_username?: string;
  resource_type?: string;
  resource_id?: string;
  page?: number;
  page_size?: number;
}) {
  return api.get<T>("/audit-logs/", query);
}

/** GET /subscriptions/ — paginated. */
function listSubscriptions<T = unknown>(query?: {
  status?: string;
  page?: number;
}) {
  return api.get<T>("/subscriptions/", query);
}

/** POST /subscriptions/{id}/renew/ — extend by one billing cycle. */
function renewSubscription<T = unknown>(subscriptionId: string | number) {
  return api.post<T>(`/subscriptions/${subscriptionId}/renew/`);
}

/** POST /subscriptions/{id}/cancel/ — cancel & disable auto_renew. */
function cancelSubscription<T = unknown>(subscriptionId: string | number) {
  return api.post<T>(`/subscriptions/${subscriptionId}/cancel/`);
}

/** GET /applications/ — paginated list of external ISP frontend apps. */
function listApplications<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/applications/", query);
}

/** GET /packages/ — paginated subscription packages. */
function listPackages<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/packages/", query);
}

/** POST /packages/{id}/toggle-status/ — pause/resume a package. */
function togglePackageStatus<T = unknown>(packageId: string | number) {
  return api.post<T>(`/packages/${packageId}/toggle-status/`);
}

/** GET /payments/ — paginated cross-tenant payment ledger. */
function listPlatformPayments<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/payments/", query);
}

/** GET /backups/ — paginated platform backups. */
function listBackups<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/backups/", query);
}

/** POST /backups/create-backup/ — trigger a snapshot. */
function createBackup<T = unknown>(payload: {
  name?: string;
  backup_type?: "full_database" | "tenant_data";
}) {
  return api.post<T>("/backups/create-backup/", payload);
}

/** GET /users/ — SaaS-side users (platform staff, not tenant users). */
function listPlatformUsers<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/users/", query);
}

/** GET /domains/ — tenant domain registry. */
function listPlatformDomains<T = unknown>(query?: { page?: number }) {
  return api.get<T>("/domains/", query);
}

/** GET /feature-matrix/ — every (feature, plan) cell. */
function getFeatureMatrix<T = unknown>() {
  return api.get<T>("/feature-matrix/");
}

/** GET /features/ — feature catalog. */
function getFeatureCatalog<T = unknown>() {
  return api.get<T>("/features/");
}

/** GET /requests/ — onboarding requests awaiting review. */
function listOnboardingRequests<T = unknown>(query?: {
  status?: string;
  page?: number;
}) {
  return api.get<T>("/requests/", query);
}

/** POST /requests/{id}/approve/ — convert a request into a tenant. */
function approveOnboardingRequest<T = unknown>(requestId: string | number) {
  return api.post<T>(`/requests/${requestId}/approve/`);
}

/** POST /requests/{id}/reject/ — reject with reason. */
function rejectOnboardingRequest<T = unknown>(
  requestId: string | number,
  reason: string,
) {
  return api.post<T>(`/requests/${requestId}/reject/`, { reason });
}

export const saasApi = {
  getOverview,
  getPlatformHealth,
  listTenants,
  getTenantTelemetry,
  bulkSuspendTenants,
  bulkActivateTenants,
  toggleTenantStatus,
  impersonateTenant,
  listAuditLogs,
  listSubscriptions,
  renewSubscription,
  cancelSubscription,
  listApplications,
  listPackages,
  togglePackageStatus,
  listPlatformPayments,
  listBackups,
  createBackup,
  listPlatformUsers,
  listPlatformDomains,
  getFeatureMatrix,
  getFeatureCatalog,
  listOnboardingRequests,
  approveOnboardingRequest,
  rejectOnboardingRequest,
};

// ---------------------------------------------------------------------------
// Shared types + server-callable helpers (no "use client" in this module).
// ---------------------------------------------------------------------------

export type SaasAdminUser = {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  role?: string;
  platform?: string;
};

export type LoginResponse = {
  session_token: string;
  token?: string;
  session_id?: string;
  session_expires_at?: string;
  session_context?: string;
  user: SaasAdminUser;
  message?: string;
};

/**
 * Server-side guard helper. Validates a SaaS session by calling
 * GET /auth/me/ with the supplied token (read from cookie or header
 * upstream). Returns the user or null when the call is 401/403.
 *
 * Safe to call from server components, route handlers, and middleware —
 * `api.ts` has no "use client" pragma and guards `window` access itself.
 *
 * NOTE: A missing token returns null immediately. A 401/403 from the
 * backend means the session was revoked — we propagate `null` so the
 * caller can redirect to `/login`. We do **not** silently fabricate a
 * fallback user (the previous dev-only shortcut was removed for v1 — see
 * sass-admin/task.md T-01).
 */
export async function serverMe(
  tokenFromServer?: string | null,
): Promise<SaasAdminUser | null> {
  const token = tokenFromServer;

  if (!token) return null;
  try {
    const res = await apiFetch<SaasAdminUser>("/auth/me/", {
      token,
    });

    return res;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    // Non-auth errors (500, network) propagate so the route can render
    // its error boundary with a real cause.
    throw err;
  }
}
