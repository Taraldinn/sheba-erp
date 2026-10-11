import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { STORAGE_KEYS } from './lib/api/storage';

export function middleware(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // SaaS Control Plane Protection
    if (pathname.startsWith('/saas') && !pathname.startsWith('/saas/login')) {
        const centralToken = request.cookies.get(STORAGE_KEYS.centralToken)?.value;
        if (!centralToken) {
            const loginUrl = new URL('/saas/login', request.url);
            loginUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(loginUrl);
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
    matcher: ['/saas/:path*', '/tenant/:path*', '/isp/:path*'],
};
