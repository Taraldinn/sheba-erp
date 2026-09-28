"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_STORAGE_KEY, serverMe, type SaasAdminUser } from "@/lib/api";

const SESSION_COOKIE_NAME = "sheba_session";

/**
 * Server-side guard for /admin pages. Reads the SaaS session cookie or the
 * `Session` header (whichever the upstream proxy preserves) and validates
 * it by calling GET /auth/me/. Redirects to /login on 401/403.
 *
 * Use at the top of any server component page that should be gated.
 */
export async function requireSaasAdmin(nextPath?: string): Promise<SaasAdminUser> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieToken =
    cookieStore.get(SESSION_COOKIE_NAME)?.value ??
    cookieStore.get(SESSION_STORAGE_KEY)?.value ??
    null;
  const headerToken = headerStore.get("x-sheba-session");

  // Try cookie first, then header.
  const user = await serverMe(cookieToken ?? headerToken ?? null);
  if (!user) {
    const next = nextPath
      ? `?next=${encodeURIComponent(nextPath)}`
      : "";
    redirect(`/login${next}`);
  }
  return user;
}
