'use client';

import Link from 'next/link';
import { useQuery } from '@/lib/query/native';
import { reportsApi } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { ErrorAlert, PageHeader, KpiCard, StatusBadge, MoneyText } from '@/components/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


export default function TenantDashboard() {
    const dashboard = useQuery({
        queryKey: queryKeys.tenantDashboard(),
        queryFn: () => reportsApi.dashboard(),
    });
    const o = dashboard.data;

    return (
        <div className="space-y-6">
            <PageHeader title="Operations" description="Operational KPIs for this tenant." />
            {dashboard.error && <ErrorAlert title="Failed to load dashboard" error={dashboard.error} />}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total customers" value={o?.total_customers ?? '—'} />
                <KpiCard label="Active subscriptions" value={o?.active_subscriptions ?? '—'} />
                <KpiCard label="MRR" value={<MoneyText value={o?.mrr} />} />
                <KpiCard
                    label="Outstanding due"
                    value={<MoneyText value={o?.total_due} />}
                    danger={Number(o?.total_due ?? 0) > 0}
                />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {o?.recent_payments && o.recent_payments.length > 0 ? (
                            <ul className="space-y-2 text-sm">
                                {o.recent_payments.map((p: { id: string; customer_name?: string; amount?: number | string; status?: string }) => (
                                    <li
                                        key={p.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3"
                                    >
                                        <span className="font-medium">{p.customer_name ?? p.id}</span>
                                        <MoneyText value={p.amount} />
                                        {p.status ? <StatusBadge status={p.status} /> : null}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground">No recent payments.</p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Quick links</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <QuickLink href="/tenant/customers" label="Customers" hint="Add a new subscriber" />
                        <QuickLink href="/tenant/packages" label="Packages" hint="Create or update plans" />
                        <QuickLink href="/tenant/invoices" label="Invoices" hint="Run billing" />
                        <QuickLink href="/tenant/routers" label="Routers" hint="Sync MikroTik devices" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function QuickLink({ href, label, hint }: { href: '/tenant/customers' | '/tenant/packages' | '/tenant/invoices' | '/tenant/routers'; label: string; hint: string }) {
    return (
        <Link
            href={href}
            className="flex items-center justify-between rounded-md border border-border bg-card p-3 transition-colors hover:border-primary"
        >
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
        </Link>
    );
}
