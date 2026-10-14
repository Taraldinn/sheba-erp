'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Router, ShieldCheck } from 'lucide-react';
import { usePortal } from '@/lib/portal/portal-provider';
import { AuthShell } from '@/components/auth/auth-shell';

/**
 * Generic "sign in" landing. Renders a portal picker instead of
 * auto-redirecting — auto-redirects on a public page tend to surprise
 * users who came in from a marketing link. The middleware still
 * redirects users hitting protected /saas/*, /isp/*, or /tenant/*
 * paths to their respective login screens, so this is a safety net
 * for direct /login visits only.
 */
export default function LoginRedirect() {
    const portal = usePortal();
    return <LoginFallback preferPortal={portal.portal} />;
}

const PORTALS = [
    { href: '/saas/login', key: 'SUPER_ADMIN', label: 'Super Admin', hint: 'Platform control plane', Icon: ShieldCheck },
    { href: '/isp/login', key: 'ISP_ADMIN', label: 'ISP Admin', hint: 'Manage your ISP workspace', Icon: Building2 },
    { href: '/tenant/login', key: 'TENANT', label: 'Tenant', hint: 'Daily operations & billing', Icon: Router },
] as const;

function LoginFallback({ preferPortal }: { preferPortal?: string }) {
    const visiblePortals = PORTALS.filter(p => {
        if (p.key === 'SUPER_ADMIN') {
            return preferPortal === 'SUPER_ADMIN';
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
                    const preferred = preferPortal === key;
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
