import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Don't intercept static assets or API proxy routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return NextResponse.next();
  }

  // ``TokenStorage.setStoredAuth`` (in src/lib/auth/token-storage.ts)
  // writes the session under the cookie name ``sheba_session`` —
  // *not* ``sheba_auth_token``. The middleware must look at the same
  // name the storage layer writes, otherwise every protected request
  // bounces back to /login even after a successful sign-in. We accept
  // either of the legacy names as a transition aid.
  const authToken =
    request.cookies.get("sheba_session")?.value ??
    request.cookies.get("sheba_auth_token")?.value;

  // If trying to access protected paths without token cookie, redirect to login
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

  if (!isPublicPath && !authToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};

