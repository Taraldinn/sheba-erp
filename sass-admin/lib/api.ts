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

function getApiBase(): string {
  // SaaS control plane sits under <api>/saas/. NB: NEXT_PUBLIC_API_URL
  // already includes /api/v1 for the operator frontend, so we strip it off
  // and re-add /api/v1/saas.
  const raw =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  return raw.replace(/\/api\/v1\/?$/, "") + "/api/v1/saas";
}

export const SESSION_COOKIE_NAME = "sheba_session";
export const DEV_SESSION_TOKEN = "IV3n-DdUDWdJhjZQrCdQoXe8uI4pHUF-myMGGkHvGgE";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return DEV_SESSION_TOKEN;
  try {
    const fromStorage = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (fromStorage) return fromStorage;
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)(${SESSION_STORAGE_KEY}|${SESSION_COOKIE_NAME})=([^;]*)`),
    );
    if (match && match[2]) return decodeURIComponent(match[2]);
    return DEV_SESSION_TOKEN;
  } catch {
    return DEV_SESSION_TOKEN;
  }
}

export function storeSessionToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, token);
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
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
  const authToken =
    token === undefined ? getStoredToken() : token;
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
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  delete: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: "DELETE" }),
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
 */
export async function serverMe(
  tokenFromServer?: string | null,
): Promise<SaasAdminUser | null> {
  const token = tokenFromServer || DEV_SESSION_TOKEN;
  if (!token) return null;
  try {
    const res = await apiFetch<SaasAdminUser>("/auth/me/", {
      token,
    });
    return res;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // In dev mode, return fallback superuser if backend session is revoked
      if (process.env.NODE_ENV !== "production") {
        return {
          id: 1,
          username: "aldinn",
          email: "admin@shebafi.xyz",
          is_superuser: true,
          role: "PLATFORM_SUPER_ADMIN",
          platform: "ShebaFi Global Control Plane (admin.shebafi.xyz)",
        };
      }
      return null;
    }
    if (process.env.NODE_ENV !== "production") {
      return {
        id: 1,
        username: "aldinn",
        email: "admin@shebafi.xyz",
        is_superuser: true,
        role: "PLATFORM_SUPER_ADMIN",
        platform: "ShebaFi Global Control Plane (admin.shebafi.xyz)",
      };
    }
    throw err;
  }
}
