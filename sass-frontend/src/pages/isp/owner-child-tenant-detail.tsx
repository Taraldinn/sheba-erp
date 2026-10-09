/**
 * ISP Owner Dashboard — Child tenant detail.
 *
 * Drill-down for a single child tenant with three panels:
 *   - Overview KPI roll-up
 *   - Domains (read-only)
 *   - Modules  (read-only feature flags)
 *
 * Mutations (impersonate, admin user mgmt) live on dedicated routes.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
    AlertCircle,
    ArrowLeft,
    Building07,
    CheckDone01,
    Globe01,
    Package,
    RefreshCw01,
    Key01,
    Users01,
} from '@untitledui/icons';
import {
    ispAdminApi,
    IspAdminChildTenantOverview,
    IspAdminDomain,
    IspAdminModuleRow,
} from '@/api/client';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';

type Tab = 'overview' | 'domains' | 'modules';

export function OwnerChildTenantDetailScreen() {
    const { id = '' } = useParams<{ id: string }>();
    const [tab, setTab] = useState<Tab>('overview');
    const [overview, setOverview] = useState<IspAdminChildTenantOverview | null>(null);
    const [domains, setDomains] = useState<IspAdminDomain[]>([]);
    const [modules, setModules] = useState<IspAdminModuleRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const [ov, doms, mods] = await Promise.all([
                ispAdminApi.getChildTenantOverview(id),
                ispAdminApi.listChildTenantDomains(id),
                ispAdminApi.listChildTenantModules(id).then((r: { features: IspAdminModuleRow[] }) => r.features),
            ]);
            setOverview(ov);
            setDomains(doms);
            setModules(mods);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load tenant');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) load();
    }, [id]);

    const enabledModuleCount = useMemo(
        () => modules.filter((m) => m.enabled).length,
        [modules],
    );

    return (
        <div className="px-4 py-6 lg:px-8">
            <Link
                to="/admin/child-tenants"
                className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to tenants
            </Link>

            {error ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Building07 className="h-5 w-5 text-tertiary" />
                        <h1 className="text-2xl font-semibold text-primary">
                            {overview?.tenant_name ?? 'Child tenant'}
                        </h1>
                    </div>
                    {overview ? (
                        <p className="mt-1 text-sm text-tertiary">
                            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
                                {overview.tenant_slug}
                            </code>
                            <span className="ml-2">
                                <Badge color={overview.is_active ? 'success' : 'gray'} size="sm">
                                    {overview.is_active ? 'Active' : 'Disabled'}
                                </Badge>
                            </span>
                            <span className="ml-2">
                                <Badge color="indigo" size="sm">
                                    {overview.subscription_status}
                                </Badge>
                            </span>
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to={`/admin/child-tenants/${id}/admin-user`}>
                        <Button color="secondary" size="md" iconLeading={Users01}>
                            Admin user
                        </Button>
                    </Link>
                    <Link to={`/admin/child-tenants/${id}/impersonate`}>
                        <Button color="primary" size="md" iconLeading={Key01}>
                            Impersonate
                        </Button>
                    </Link>
                    <Button
                        color="tertiary"
                        size="md"
                        iconLeading={RefreshCw01}
                        onClick={load}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            <div className="mt-6 border-b border-border-secondary">
                <nav className="flex gap-1">
                    {(['overview', 'domains', 'modules'] as Tab[]).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                                tab === t
                                    ? 'border-brand-primary text-primary'
                                    : 'border-transparent text-tertiary hover:text-primary'
                            }`}
                        >
                            {t === 'overview' && 'Overview'}
                            {t === 'domains' && `Domains (${domains.length})`}
                            {t === 'modules' &&
                                `Modules (${enabledModuleCount} enabled)`}
                        </button>
                    ))}
                </nav>
            </div>

            {loading ? (
                <div className="mt-6 text-sm text-tertiary">Loading…</div>
            ) : tab === 'overview' ? (
                <OverviewPanel data={overview} enabledModules={enabledModuleCount} />
            ) : tab === 'domains' ? (
                <DomainsPanel domains={domains} />
            ) : (
                <ModulesPanel modules={modules} />
            )}
        </div>
    );
}

function OverviewPanel({
    data,
    enabledModules,
}: {
    data: IspAdminChildTenantOverview | null;
    enabledModules: number;
}) {
    if (!data) return <div className="mt-6 text-sm text-tertiary">No data.</div>;
    return (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Customers" value={data.customer_count} icon={Users01} accent="warning" />
            <Stat label="Custom domains" value={data.domain_count} icon={Globe01} accent="cyan" />
            <Stat
                label="Active modules"
                value={enabledModules}
                icon={Package}
                accent="indigo"
            />
            <Stat
                label="Subscription"
                value={data.subscription_status}
                icon={CheckDone01}
                accent="success"
            />
        </div>
    );
}

function DomainsPanel({ domains }: { domains: IspAdminDomain[] }) {
    if (domains.length === 0) {
        return (
            <div className="mt-6 rounded-2xl border border-border-secondary bg-bg-primary p-12 text-center text-sm text-tertiary">
                <Globe01 className="mx-auto h-8 w-8 text-quaternary" />
                <p className="mt-2">No domains configured for this child tenant.</p>
            </div>
        );
    }
    return (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border-secondary bg-bg-primary">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-border-secondary text-left text-xs uppercase tracking-wide text-tertiary">
                        <th className="px-4 py-3">Hostname</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Status</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-secondary">
                    {domains.map((d) => (
                        <tr key={d.id} className="hover:bg-secondary_alt">
                            <td className="px-4 py-3 font-medium text-primary">{d.hostname}</td>
                            <td className="px-4 py-3 text-tertiary">{d.domain_type}</td>
                            <td className="px-4 py-3">
                                {d.verified ? (
                                    <Badge color="success" size="sm">Verified</Badge>
                                ) : d.is_active ? (
                                    <Badge color="warning" size="sm">Pending</Badge>
                                ) : (
                                    <Badge color="gray" size="sm">Inactive</Badge>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ModulesPanel({ modules }: { modules: IspAdminModuleRow[] }) {
    if (modules.length === 0) {
        return (
            <div className="mt-6 rounded-2xl border border-border-secondary bg-bg-primary p-12 text-center text-sm text-tertiary">
                <Package className="mx-auto h-8 w-8 text-quaternary" />
                <p className="mt-2">No module state available for this child tenant.</p>
            </div>
        );
    }
    return (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
                <div
                    key={m.key}
                    className="rounded-xl border border-border-secondary bg-bg-primary p-4"
                >
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-primary">{m.label}</p>
                        {m.enabled ? (
                            <Badge color="success" size="sm">On</Badge>
                        ) : (
                            <Badge color="gray" size="sm">Off</Badge>
                        )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-quaternary">{m.key}</p>
                    <p className="mt-2 text-xs text-tertiary">{m.category}</p>
                </div>
            ))}
        </div>
    );
}

function Stat({
    label,
    value,
    icon: Icon,
    accent,
}: {
    label: string;
    value: number | string;
    icon: React.ComponentType<{ className?: string }>;
    accent: 'indigo' | 'success' | 'warning' | 'cyan';
}) {
    const accentBg = {
        indigo: 'bg-indigo-50 text-indigo-700',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-700',
        cyan: 'bg-cyan-50 text-cyan-700',
    }[accent];
    return (
        <div className="rounded-2xl border border-border-secondary bg-bg-primary p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm text-tertiary">{label}</p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-primary">
                        {value}
                    </p>
                </div>
                <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${accentBg}`}
                >
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}