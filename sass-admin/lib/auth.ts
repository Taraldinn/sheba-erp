"use client";

import { api, storeSessionToken, syncSessionCookie, type SaasAdminUser, type LoginResponse } from "./api";

export type { SaasAdminUser, LoginResponse };

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login/", { username, password });
  const token = res?.session_token || res?.token;
  if (token) {
    storeSessionToken(token);
    await syncSessionCookie(token);
  }
  return res;
}

export async function logout(): Promise<void> {
  try {
    await api.post("/auth/logout/");
  } finally {
    storeSessionToken(null);
    await syncSessionCookie(null);
  }
}

export async function me(): Promise<SaasAdminUser> {
  return api.get<SaasAdminUser>("/auth/me/");
}

export { ApiError } from "./api";

// NOTE: `serverMe` is exported from `@/lib/api` (no "use client"). Do NOT
// re-export it from this module — that would mark it client-only and break
// server-component callers like `app/page.tsx` and `admin-auth-guard.tsx`.
