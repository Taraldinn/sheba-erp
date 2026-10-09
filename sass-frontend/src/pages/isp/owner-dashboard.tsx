/**
 * ISP Owner Dashboard — Overview.
 *
 * KPI roll-up for the parent SaaS-subscriber tenant. Mounted at
 * ``/admin/overview`` (or `/admin` index) inside the ISP_ADMIN
 * portal (host ``app.example.xyz``).
 */
import React, { useEffect, useState } from 'react';
import {
    BarChartSquare01,
    Building07,
    CheckDone01,
    Globe01,
    Package,
    Users01,
} from '@untitledui/icons';
import { Link } from 'react-router';
import { ispAdminApi, IspAdminOverview } from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';

function StatCard({
    label,
    value,
    icon: Icon,
    hint,
    accent = 'indigo',
}: {
    label: string;
    value: number | string;
    icon: React.ComponentType<{ className?: string }>;
    hint?: string;
    accent?: 'indigo' | 'success' | 'warning' | 'error' | 'cyan';
}) {
    const accentBg = {
        indigo: 'bg-indigo-50 text-indigo-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        error: 'bg-rose-50 text-rose-700',
        cyan: 'bg-cyan-50 text-cyan-700',
    }[accent];

    return (
        <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm text-tertiary">{label}</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-primary">
                        {value}
                    </p>
                    {hint ? <p className="mt-2 text-xs text-tertiary">{hint}</p> : null}
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentBg}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}

export function OwnerOverviewScreen() {
    const [data, setData] = useState<IspAdminOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        ispAdminApi
            .getOverview()
            .then((res: IspAdminOverview) => alive && setData(res))
            .catch((err: unknown) =>
                alive && setError(err instanceof Error ? err.message : 'Failed to load overview'),
            )
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="p-6 text-sm text-tertiary">Loading ISP owner overview…</div>
        );
    }

    if (error || !data) {
        return (
            <div className="p-6">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-primary">ISP Owner Dashboard</h1>
                        <p className="mt-1 text-sm text-tertiary">
                            Failed to load the overview.
                        </p>
                    </div>
                </div>
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error ?? 'Unknown error'}
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 py-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">ISP Owner Dashboard</h1>
                    <p className="mt-1 text-sm text-tertiary">
                        Welcome back. This is the configuration & operations panel for {data.tenant_name}.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/admin/child-tenants">
                        <Button color="primary" size="md" iconLeading={Building07}>
                            Manage tenants
                        </Button>
                    </Link>
                    <Link to="/admin/modules">
                        <Button color="secondary" size="md" iconLeading={Package}>
                            Modules
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="mt-6 flex items-center gap-3 rounded-xl border border-border-secondary bg-bg-primary p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                    <CheckDone01 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                    <p className="text-sm font-medium text-primary">
                        {data.tenant_name} · {data.tenant_slug}
                    </p>
                    <p className="mt-0.5 text-xs text-tertiary">
                        Plan: <Badge color="indigo" size="sm">{data.plan}</Badge>
                        <span className="ml-2">
                            Status:{' '}
                            <Badge
                                color={data.subscription_status === 'active' ? 'success' : 'warning'}
                                size="sm"
                            >
                                {data.subscription_status}
                            </Badge>
                        </span>
                    </p>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    label="Custom domains"
                    value={data.domain_count}
                    icon={Globe01}
                    hint={`${data.verified_domain_count} verified`}
                    accent="cyan"
                />
                <StatCard
                    label="Subscribed modules"
                    value={`${data.enabled_modules_count} / ${data.total_modules_count}`}
                    icon={Package}
                    hint="Active platform features"
                    accent="indigo"
                />
                <StatCard
                    label="Child tenants"
                    value={data.child_tenant_count}
                    icon={Building07}
                    hint={`${data.child_tenant_active_count} active`}
                    accent="success"
                />
                <StatCard
                    label="Aggregate subscribers"
                    value={data.aggregate_subscriber_count}
                    icon={Users01}
                    hint="Across all child tenants"
                    accent="warning"
                />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-primary">Quick actions</h2>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Link
                            to="/admin/child-tenants"
                            className="group flex items-start gap-3 rounded-xl border border-border-secondary p-4 hover:border-brand-primary"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100">
                                <Building07 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-primary">
                                    Provision a child tenant
                                </p>
                                <p className="mt-1 text-xs text-tertiary">
                                    Create a new sub-ISP under your SaaS subscription.
                                </p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/domains"
                            className="group flex items-start gap-3 rounded-xl border border-border-secondary p-4 hover:border-brand-primary"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100">
                                <Globe01 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-primary">
                                    Add a custom domain
                                </p>
                                <p className="mt-1 text-xs text-tertiary">
                                    Verify DNS and attach a CNAME to your tenant.
                                </p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/modules"
                            className="group flex items-start gap-3 rounded-xl border border-border-secondary p-4 hover:border-brand-primary"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100">
                                <Package className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-primary">
                                    Subscribe to a module
                                </p>
                                <p className="mt-1 text-xs text-tertiary">
                                    Enable platform features for your tenant.
                                </p>
                            </div>
                        </Link>
                        <Link
                            to="/admin/child-tenants"
                            className="group flex items-start gap-3 rounded-xl border border-border-secondary p-4 hover:border-brand-primary"
                        >
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100">
                                <BarChartSquare01 className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-primary">
                                    Impersonate a tenant admin
                                </p>
                                <p className="mt-1 text-xs text-tertiary">
                                    Operate a child tenant's core app on its behalf.
                                </p>
                            </div>
                        </Link>
                    </div>
                </div>

                <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
                    <h2 className="text-sm font-semibold text-primary">Subscription</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between">
                            <dt className="text-tertiary">Plan</dt>
                            <dd className="font-medium text-primary">{data.plan}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-tertiary">Status</dt>
                            <dd>
                                <Badge
                                    color={data.subscription_status === 'active' ? 'success' : 'warning'}
                                    size="sm"
                                >
                                    {data.subscription_status}
                                </Badge>
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-tertiary">Expires</dt>
                            <dd className="font-medium text-primary">
                                {data.subscription_expires_at
                                    ? new Date(data.subscription_expires_at).toLocaleDateString()
                                    : '—'}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-tertiary">Staff members</dt>
                            <dd className="font-medium text-primary tabular-nums">
                                {data.staff_count}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    );
}
