'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Loader2, Router, ShieldCheck } from 'lucide-react';
import { usePortal } from '@/lib/portal/portal-provider';
import { AuthShell } from '@/components/auth/auth-shell';
import { storage, STORAGE_KEYS } from '@/lib/api/storage';

import { BetterAuthCard } from '@/components/auth/better-auth-card';

/**
 * Generic "sign in" landing.
 * - If launched with an `auto_token` (e.g. 1-click launch from ISP Admin), stores
 *   session credentials and redirects to the tenant workspace immediately.
 * - If accessed from a dedicated subdomain (admin.*, app.*, or {tenant}.*), routes
 *   to the appropriate portal's login screen.
 * - For app.shebafi.xyz or direct sign-in, renders BetterAuthCard (Google + Username/Email & Password).
 */
export default function LoginRedirect() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}

function LoginContent() {
    const portal = usePortal();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const autoToken = searchParams.get('auto_token');
        if (autoToken) {
            setIsAutoLoggingIn(true);
            storage.set(STORAGE_KEYS.tenantToken, autoToken);
            const slug = portal.tenantSlug || searchParams.get('tenant') || '';
            if (slug) {
                storage.set(STORAGE_KEYS.tenantSlug, slug);
                storage.setJSON(`sheba_session_tenant_${slug}`, { token: autoToken, user: null });
            }
            storage.setJSON('sheba_session_tenant_default', { token: autoToken, user: null });
            storage.setJSON('sheba_session_tenant', { token: autoToken, user: null });

            const nextParam = searchParams.get('next');
            const target = nextParam && nextParam.startsWith('/') ? nextParam : '/tenant';
            window.location.href = target;
            return;
        }

        // Subdomain auto-routing for dedicated backend portals
        if (portal.portal === 'TENANT') {
            const nextParam = searchParams.get('next');
            const target = nextParam ? `/tenant/login?next=${encodeURIComponent(nextParam)}` : '/tenant/login';
            router.replace(target);
        } else if (portal.portal === 'SUPER_ADMIN') {
            const nextParam = searchParams.get('next');
            const target = nextParam ? `/saas/login?next=${encodeURIComponent(nextParam)}` : '/saas/login';
            router.replace(target);
        } else if (portal.portal === 'ISP_ADMIN') {
            const nextParam = searchParams.get('next');
            const target = nextParam ? `/isp/login?next=${encodeURIComponent(nextParam)}` : '/isp/login';
            router.replace(target);
        }
    }, [portal.portal, portal.tenantSlug, searchParams, router]);

    if (isAutoLoggingIn) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-medium text-muted-foreground">Launching authenticated tenant session…</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-b from-background via-muted/20 to-background">
            <div className="mb-6 flex flex-col items-center text-center">
                <Link href="/" className="flex items-center gap-2 mb-2">
                    <span className="text-2xl font-black tracking-tight text-primary">Shebafi</span>
                </Link>
                <p className="text-xs text-muted-foreground">Organization & Broadband Management Portal</p>
            </div>
            <BetterAuthCard mode="signin" callbackUrl={searchParams.get('next') || '/dashboard'} />
            
            <div className="mt-8 text-center text-xs text-muted-foreground">
                <p>Need platform administration or staff access?</p>
                <div className="mt-2 flex items-center justify-center gap-4">
                    <Link href="/saas/login" className="hover:text-primary transition-colors underline">
                        Super Admin
                    </Link>
                    <span>•</span>
                    <Link href="/isp/login" className="hover:text-primary transition-colors underline">
                        ISP Staff Portal
                    </Link>
                </div>
            </div>
        </div>
    );
}
