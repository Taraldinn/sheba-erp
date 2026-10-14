import { Suspense } from 'react';
import type { Metadata } from 'next';

import {
    getDashboardOverviewServer,
    getOrganizationsServer,
    getTenantsServer,
    ServerApiError,
} from '@/lib/api/server';
import { TenantsView } from './_components/tenants-view';
import { TenantsSkeleton } from './_components/tenants-skeleton';

export const metadata: Metadata = {
    title: 'Tenants · SaaS Control Plane',
    description: 'ISP tenants provisioned on the platform.',
};

export const dynamic = 'force-dynamic';

interface TenantsPageProps {
    searchParams: Promise<{
        page?: string;
        search?: string;
        is_active?: string;
        plan?: string;
        organization?: string;
    }>;
}

function explainError(err: unknown): string {
    if (err instanceof ServerApiError) return err.message;
    if (err instanceof Error) return err.message;
    return 'Could not load tenants.';
}

export default async function SaasTenantsPage({ searchParams }: TenantsPageProps) {
    const sp = (await searchParams) || {};
    const page = Math.max(1, Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1);
    const search = typeof sp.search === 'string' ? sp.search.trim() : '';
    const is_active = typeof sp.is_active === 'string' ? sp.is_active : '';
    const plan = typeof sp.plan === 'string' ? sp.plan : '';
    const organization = typeof sp.organization === 'string' ? sp.organization : '';

    return (
        <Suspense
            key={`${page}|${search}|${is_active}|${plan}|${organization}`}
            fallback={<TenantsSkeleton />}
        >
            <TenantsPageBody
                page={page}
                search={search}
                is_active={is_active}
                plan={plan}
                organization={organization}
            />
        </Suspense>
    );
}

async function TenantsPageBody({
    page,
    search,
    is_active,
    plan,
    organization,
}: {
    page: number;
    search: string;
    is_active: string;
    plan: string;
    organization: string;
}) {
    let tenants: Awaited<ReturnType<typeof getTenantsServer>> | null = null;
    let orgs: Awaited<ReturnType<typeof getOrganizationsServer>> | null = null;
    let overview: Awaited<ReturnType<typeof getDashboardOverviewServer>> | null = null;
    let loadError: string | null = null;

    try {
        [tenants, orgs, overview] = await Promise.all([
            getTenantsServer({ page, search, is_active, plan, organization }),
            getOrganizationsServer({ page: '1' }),
            getDashboardOverviewServer(),
        ]);
    } catch (err) {
        loadError = explainError(err);
    }

    return (
        <TenantsView
            page={page}
            search={search}
            is_active={is_active}
            plan={plan}
            organization={organization}
            tenants={tenants}
            organizations={orgs}
            overview={overview}
            loadError={loadError}
        />
    );
}
