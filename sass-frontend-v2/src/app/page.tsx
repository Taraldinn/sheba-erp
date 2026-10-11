'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, Building2, Globe, KeyRound, Network, Users } from 'lucide-react';

import { usePortal } from '@/lib/portal/portal-provider';
import { useAuth } from '@/lib/auth/auth-provider';
import { publicApi } from '@/lib/api/public';
import {
    Faq,
    FeatureCard,
    FeatureGrid,
    Hero,
    HowItWorks,
    MarketingFooter,
    MarketingHeader,
    Pricing,
} from '@/components/marketing/MarketingShell';

export default function Home() {
    const portal = usePortal();
    const auth = useAuth();
    const router = useRouter();

    // If the visitor is already authed as a saas/isp/tenant user, send them home.
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

    // Pull live packages from the public endpoint so the pricing strip is
    // always in sync with the saas admin's `SaaSPackage` rows.
    const packages = useQuery({
        queryKey: ['public', 'packages'],
        queryFn: () => publicApi.getPublicPackages(),
        staleTime: 5 * 60 * 1000,
        retry: 0,
    });

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
        <div className="min-h-screen bg-background">
            <MarketingHeader />
            <main>
                <Hero />
                <FeatureGrid>
                    <FeatureCard
                        icon={<Building2 className="h-4 w-4" />}
                        title="Organization-first control plane"
                        body="Every ISP you run is a child of a parent organization. Operators see a single list of orgs, not 200 scattered tenants."
                    />
                    <FeatureCard
                        icon={<Users className="h-4 w-4" />}
                        title="Multi-tenant by design"
                        body="Strict per-tenant scoping enforced server-side. Never trust a hostname or a client-supplied ID."
                    />
                    <FeatureCard
                        icon={<Network className="h-4 w-4" />}
                        title="Network ready"
                        body="MikroTik, OLT, ONU, and PPPoE workflows with polling, retries, and backoff out of the box."
                    />
                    <FeatureCard
                        icon={<Globe className="h-4 w-4" />}
                        title="Branded customer portal"
                        body="Each tenant gets its own domain and self-care portal. Branded invoices, branded login."
                    />
                    <FeatureCard
                        icon={<KeyRound className="h-4 w-4" />}
                        title="Reseller & staff"
                        body="Reseller wallet, idempotent purchases, renewals, and collections with server-confirmed balances."
                    />
                    <FeatureCard
                        icon={<Activity className="h-4 w-4" />}
                        title="Observability"
                        body="Health probes, audit log, impersonation log, and per-tenant kill switch for the platform team."
                    />
                </FeatureGrid>
                <HowItWorks />
                <Pricing
                    loading={packages.isLoading}
                    packages={packages.data ?? []}
                />
                <Faq />
            </main>
            <MarketingFooter />
        </div>
    );
}
