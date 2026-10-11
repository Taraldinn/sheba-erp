'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { usePortal } from '@/lib/portal/portal-provider';
import { useAuth } from '@/lib/auth/auth-provider';

export default function Home() {
    const portal = usePortal();
    const auth = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (portal.portal === 'SUPER_ADMIN') {
            router.replace('/saas');
        } else if (portal.portal === 'ISP_ADMIN') {
            router.replace('/isp');
        } else if (portal.portal === 'TENANT') {
            router.replace('/tenant');
        } else if (auth.isAuthenticated && portal.portal === 'PUBLIC_HOME') {
            router.replace(auth.dashboardUrl);
        }
    }, [portal.portal, auth.isAuthenticated, auth.dashboardUrl, router]);

    if (portal.portal === 'UNKNOWN') {
        return (
            <main className="container mx-auto max-w-2xl px-6 py-20 text-center">
                <h1 className="mb-4 text-3xl font-semibold">Unknown host</h1>
                <p className="text-muted-foreground">
                    The hostname <code className="rounded bg-muted px-1.5 py-0.5">{portal.hostname}</code> is not registered with the Shebafi platform.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">If you operate an ISP, register a domain in the platform admin portal.</p>
                <Link href="/" className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Go to platform home
                </Link>
            </main>
        );
    }

    return (
        <main className="container mx-auto max-w-5xl px-6 py-16">
            <section className="rounded-3xl border border-border bg-card p-10 shadow-sm">
                <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Shebafi</p>
                <h1 className="text-4xl font-semibold tracking-tight">ISP ERP & SaaS Control Plane</h1>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                    Run your broadband business, manage tenants across ISPs, and operate the customer self-care portal — all from a single, multi-tenant control plane.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <Link href="/saas/login" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                        Super Admin Login
                    </Link>
                    <Link href="/isp/login" className="inline-flex rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                        ISP Admin Login
                    </Link>
                    <Link href="/request" className="inline-flex rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                        Request access
                    </Link>
                </div>
            </section>
            <section className="mt-10 grid gap-4 sm:grid-cols-3">
                <Card title="Multi-tenant by design" body="Strict per-tenant scoping enforced by the backend — never trust a hostname or a client-supplied ID." />
                <Card title="Reseller wallet" body="Idempotent purchases, renewals, and collections with server-confirmed balances." />
                <Card title="Network ready" body="MikroTik, OLT, ONU, and PPPoE workflows with polling, retries, and backoff." />
            </section>
        </main>
    );
}

function Card({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
    );
}
