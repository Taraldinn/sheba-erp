import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CONTROL_PLANE_HOSTS = [
  "admin.shebafi.xyz",
  "control.shebafi.xyz",
  "admin.shebaerp.com",
  "admin.localhost",
  "saas.localhost",
  "admin.localhost.com",
  "control.localhost.com",
  "saas.localhost.com",
];

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || request.nextUrl.hostname).split(":")[0].toLowerCase();
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

  const isControlPlane =
    CONTROL_PLANE_HOSTS.includes(host) ||
    host.startsWith("admin.") ||
    host.startsWith("control.") ||
    host.startsWith("saas.");

  const authToken = request.cookies.get("sheba_auth_token")?.value;

  // Edge protection for Control Plane root and administration paths
  if (isControlPlane) {
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/saas-admin";
      return NextResponse.rewrite(url);
    }
  }

  // If trying to access control plane without token cookie, redirect to login
  if (pathname.startsWith("/saas-admin") && !authToken) {
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
