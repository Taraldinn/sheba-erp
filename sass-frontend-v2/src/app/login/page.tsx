'use client';

import Link from 'next/link';
import { usePortal } from '@/lib/portal/portal-provider';

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

function LoginFallback({ preferPortal }: { preferPortal?: string }) {
    return (
        <main className="container mx-auto max-w-md px-6 py-20">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <h1 className="text-2xl font-semibold">Sign in</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose the portal you&apos;d like to sign in to.</p>
                <div className="mt-6 space-y-2">
                    <Link
                        href="/saas/login"
                        className={
                            'block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold ' +
                            (preferPortal === 'SUPER_ADMIN'
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'border border-border bg-background hover:bg-muted')
                        }
                    >
                        Super Admin
                    </Link>
                    <Link
                        href="/isp/login"
                        className={
                            'block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold ' +
                            (preferPortal === 'ISP_ADMIN'
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'border border-border bg-background hover:bg-muted')
                        }
                    >
                        ISP Admin
                    </Link>
                    <Link
                        href="/tenant/login"
                        className={
                            'block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold ' +
                            (preferPortal === 'TENANT'
                                ? 'bg-primary text-primary-foreground hover:opacity-90'
                                : 'border border-border bg-background hover:bg-muted')
                        }
                    >
                        Tenant
                    </Link>
                </div>
            </div>
        </main>
    );
}
