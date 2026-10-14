'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, Loader2, Router, ShieldCheck } from 'lucide-react';
import { usePortal } from '@/lib/portal/portal-provider';
import { AuthShell } from '@/components/auth/auth-shell';
import { storage, STORAGE_KEYS } from '@/lib/api/storage';

/**
 * Generic "sign in" landing.
 * - If launched with an `auto_token` (e.g. 1-click launch from ISP Admin), stores
 *   session credentials and redirects to the tenant workspace immediately.
 * - If accessed from a dedicated subdomain (admin.*, app.*, or {tenant}.*), routes
 *   to the appropriate portal's login screen.
 * - Otherwise renders the portal picker for public marketing visitors, with
 *   client-only highlight to prevent SSR hydration mismatches.
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

        // Subdomain auto-routing for dedicated portals
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

    return <LoginFallback preferPortal={portal.portal} />;
}

const PORTALS = [
    { href: '/saas/login', key: 'SUPER_ADMIN', label: 'Super Admin', hint: 'Platform control plane', Icon: ShieldCheck },
    { href: '/isp/login', key: 'ISP_ADMIN', label: 'ISP Admin', hint: 'Manage your ISP workspace', Icon: Building2 },
    { href: '/tenant/login', key: 'TENANT', label: 'Tenant', hint: 'Daily operations & billing', Icon: Router },
] as const;

function LoginFallback({ preferPortal }: { preferPortal?: string }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Only compute preferred portal after client mounts to prevent SSR hydration mismatch
    const activePortal = mounted ? preferPortal : undefined;

    const visiblePortals = PORTALS.filter(p => {
        if (p.key === 'SUPER_ADMIN') {
            return activePortal === 'SUPER_ADMIN';
        }
        return true;
    });

    return (
        <AuthShell
            portalLabel="Shebafi"
            title="Sign in"
            description="Choose the portal you'd like to sign in to."
            icon={<ShieldCheck className="size-4" aria-hidden="true" />}
            panelTitle="One platform. Dedicated workspaces."
            panelBody="ISP owners and tenant staff each get a workspace designed for the job they do."
            highlights={['Strict per-tenant isolation', 'Branded domains & portals', 'Role-aware dashboards']}
        >
            <ul className="flex flex-col gap-3">
                {visiblePortals.map(({ href, key, label, hint, Icon }) => {
                    const preferred = activePortal === key;
                    return (
                        <li key={href}>
                            <Link
                                href={href}
                                className={`group flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                                    preferred ? 'border-primary bg-accent' : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50'
                                }`}
                            >
                                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="size-5" aria-hidden="true" />
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="text-sm font-semibold">{label}</span>
                                    <span className="text-xs text-muted-foreground">{hint}</span>
                                </span>
                                <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </AuthShell>
    );
}
