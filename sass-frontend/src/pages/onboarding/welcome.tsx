import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { saasApi } from '@/api/client';
import { usePlane } from '@/providers/plane-provider';
import type { Tenant } from '@/api/types';

interface UrlParams extends Record<string, string | undefined> {
    slug: string;
}

export const WelcomePage = () => {
    const { slug } = useParams<UrlParams>();
    const plane = usePlane();
    const [tenant, setTenant] = useState<Tenant | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!slug) return;
        let cancelled = false;
        (async () => {
            try {
                const t = await saasApi.getTenantBySlug(slug);
                if (!cancelled) setTenant(t);
            } catch {
                if (!cancelled) setTenant(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [slug]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-secondary to-bg-primary text-primary">
            <header className="border-b border-border-secondary bg-bg-primary/60 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fg-brand-primary text-white">
                            <span className="text-sm font-bold">SF</span>
                        </div>
                        <span className="text-sm font-semibold">ShebaFi</span>
                    </div>
                    <Link to="/login" className="text-sm font-medium text-tertiary hover:text-secondary">
                        Staff login →
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-6 py-16">
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-8 shadow-sm sm:p-12">
                        <span className="inline-flex items-center gap-2 rounded-full border border-border-secondary px-3 py-1 text-xs font-medium text-tertiary">
                            <span className="h-1.5 w-1.5 rounded-full bg-fg-brand-primary" />
                            {plane.plane === 'tenant' ? 'Tenant portal' : 'Onboarding portal'}
                        </span>
                        <h1 className="mt-6 text-display-sm font-semibold sm:text-display-md">
                            {loading ? 'Loading your portal…' : `Welcome to ${tenant?.name || slug}`}
                        </h1>
                        <p className="mt-4 text-tertiary">
                            Your ISP workspace has been provisioned by the ShebaFi platform team.
                            Run the 6-step onboarding wizard to claim your admin account, brand
                            the customer portal, add your first POP branch, and pick the package
                            that fits your launch footprint.
                        </p>

                        {tenant ? (
                            <dl className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-border-secondary bg-bg-secondary/50 p-4 sm:grid-cols-2">
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">Tenant</dt>
                                    <dd className="mt-1 text-sm font-medium">{tenant.name}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">Schema</dt>
                                    <dd className="mt-1 font-mono text-sm">{tenant.schema_name}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">Domain</dt>
                                    <dd className="mt-1 truncate text-sm">{tenant.domain_url}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-tertiary">Status</dt>
                                    <dd className="mt-1 text-sm font-medium">
                                        {tenant.is_active ? (
                                            <span className="text-emerald-600">Active</span>
                                        ) : (
                                            <span className="text-amber-600">Pending activation</span>
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        ) : !loading ? (
                            <div className="mt-8 rounded-xl border border-amber-300/40 bg-amber-50/50 p-4 text-sm text-amber-900">
                                We couldn't reach the platform right now. The wizard will still let
                                you set up local branding and pick a package — we'll catch up
                                with the central database once it comes back online.
                            </div>
                        ) : null}

                        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Link
                                to={`/onboarding/${slug}/wizard`}
                                className="inline-flex items-center justify-center rounded-lg bg-fg-brand-primary px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
                            >
                                Start the wizard →
                            </Link>
                            <Link
                                to={`/login?tenant=${encodeURIComponent(slug || '')}`}
                                className="inline-flex items-center justify-center rounded-lg border border-border-secondary bg-bg-primary px-5 py-3 text-sm font-semibold text-secondary hover:bg-bg-secondary"
                            >
                                I already have credentials
                            </Link>
                        </div>

                        <div className="mt-10 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                            {[
                                { title: '1 · Claim', body: 'Username + password' },
                                { title: '2 · Profile', body: 'Org details' },
                                { title: '3 · Branding', body: 'Logo + color + custom domain' },
                                { title: '4 · POP', body: 'First branch' },
                                { title: '5 · Package', body: 'Pick a plan' },
                                { title: '6 · Launch', body: 'Open dashboard' },
                            ].map((s) => (
                                <div key={s.title} className="rounded-lg border border-border-secondary p-3">
                                    <div className="text-xs font-semibold text-tertiary">{s.title}</div>
                                    <div className="mt-1 text-sm font-medium">{s.body}</div>
                                </div>
                            ))}
                        </div>
                    </div>
            </main>
        </div>
    );
};

export default WelcomePage;