'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Loader2 } from 'lucide-react';
import { usePortal } from '@/lib/portal/portal-provider';
import { AuthShell } from '@/components/auth/auth-shell';
import { storage, STORAGE_KEYS } from '@/lib/api/storage';

import { BetterAuthCard } from '@/components/auth/better-auth-card';
import { useSession } from '@/lib/auth-client';
import { safeRedirectPath } from '@/lib/auth/safe-redirect';

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
    const session = useSession();
    const [isAutoLoggingIn, setIsAutoLoggingIn] = useState(false);
    const next = safeRedirectPath(searchParams.get('next') || searchParams.get('callbackUrl'));

    // Already signed in → straight to where they were headed.
    useEffect(() => {
        if (session.data?.user && !searchParams.get('auto_token')) router.replace(next);
    }, [session.data?.user, next, searchParams, router]);

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
            const target = safeRedirectPath(nextParam, '/tenant');
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
        <AuthShell
            portalLabel="Organization portal"
            title="Sign in to your organization"
            description="Use Google or your email and password."
            icon={<Building2 className="size-4" aria-hidden="true" />}
            panelTitle="Your ISP workspace, one sign-in away."
            panelBody="Manage your onboarding request, approval status and organization workspace from the Organization Hub."
            highlights={['Sign in with Google or email', 'Track your onboarding request', 'Launch your tenant workspace once approved']}
            footer={
                <p>
                    Platform admin or staff?{' '}
                    <Link href="/saas/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                        Super Admin
                    </Link>
                    {' · '}
                    <Link href="/isp/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                        ISP Staff
                    </Link>
                </p>
            }
        >
            <BetterAuthCard mode="signin" callbackUrl={next} />
        </AuthShell>
    );
}
