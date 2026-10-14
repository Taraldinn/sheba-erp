import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { STORAGE_KEYS } from './lib/api/storage';
import { resolvePortal } from './lib/portal/resolve-portal';

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const rawHost = request.headers.get('host') || request.nextUrl.hostname;
    const hostname = rawHost.split(':')[0].toLowerCase();

    // 0. Subdomain root routing
    if (pathname === '/') {
        const resolution = resolvePortal(hostname);
        if (resolution.portal === 'SUPER_ADMIN') {
            return NextResponse.redirect(new URL('/saas', request.url));
        }
        if (resolution.portal === 'ISP_ADMIN') {
            return NextResponse.redirect(new URL('/isp', request.url));
        }
        if (resolution.portal === 'TENANT') {
            return NextResponse.redirect(new URL('/tenant', request.url));
        }
    }

    // SaaS Control Plane Protection: Only accessible from designated admin hostnames (admin.*, saas.*, control.*)
    if (pathname.startsWith('/saas')) {
        const resolution = resolvePortal(hostname);
        if (resolution.portal !== 'SUPER_ADMIN') {
            return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
        }
        if (!pathname.startsWith('/saas/login')) {
            const centralToken = request.cookies.get(STORAGE_KEYS.centralToken)?.value;
            if (!centralToken) {
                const loginUrl = new URL('/saas/login', request.url);
                loginUrl.searchParams.set('next', pathname);
                return NextResponse.redirect(loginUrl);
            }
        }
    }

    // Tenant Portal Protection
    if (pathname.startsWith('/tenant') && !pathname.startsWith('/tenant/login')) {
        const tenantToken = request.cookies.get(STORAGE_KEYS.tenantToken)?.value;
        if (!tenantToken) {
            const loginUrl = new URL('/tenant/login', request.url);
            loginUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    // ISP Portal Protection
    if (pathname.startsWith('/isp') && !pathname.startsWith('/isp/login')) {
        const tenantToken = request.cookies.get(STORAGE_KEYS.tenantToken)?.value;
        if (!tenantToken) {
            const loginUrl = new URL('/isp/login', request.url);
            loginUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/', '/saas/:path*', '/tenant/:path*', '/isp/:path*'],
};
