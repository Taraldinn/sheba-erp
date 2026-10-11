'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePortal } from '@/lib/portal/portal-provider';

export default function LoginRedirect() {
    const portal = usePortal();
    const router = useRouter();

    useEffect(() => {
        if (portal.portal === 'SUPER_ADMIN') router.push('/saas/login');
        else if (portal.portal === 'ISP_ADMIN') router.push('/isp/login');
        else if (portal.portal === 'TENANT') router.push('/tenant/login');
    }, [portal.portal, router]);

    return <LoginFallback />;
}

function LoginFallback() {
    return (
        <main className="container mx-auto max-w-md px-6 py-20">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
                <h1 className="text-2xl font-semibold">Sign in</h1>
                <p className="mt-2 text-sm text-muted-foreground">Choose the portal you'd like to sign in to.</p>
                <div className="mt-6 space-y-2">
                    <Link href="/saas/login" className="block w-full rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:opacity-90">
                        Super Admin
                    </Link>
                    <Link href="/isp/login" className="block w-full rounded-lg border border-border bg-background px-4 py-2 text-center text-sm font-semibold hover:bg-muted">
                        ISP Admin
                    </Link>
                    <Link href="/tenant/login" className="block w-full rounded-lg border border-border bg-background px-4 py-2 text-center text-sm font-semibold hover:bg-muted">
                        Tenant
                    </Link>
                </div>
            </div>
        </main>
    );
}
