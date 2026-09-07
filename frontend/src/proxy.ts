import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const CONTROL_PLANE_HOSTS = [
  "admin.shebafi.xyz",
  "control.shebafi.xyz",
  "admin.shebaerp.com",
  "admin.localhost",
  "saas.localhost",
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

  // If host is the SaaS Control Plane domain (e.g. admin.shebafi.xyz or admin.localhost)
  if (isControlPlane) {
    if (pathname === "/" || pathname === "") {
      const url = request.nextUrl.clone();
      url.pathname = "/saas-admin";
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
