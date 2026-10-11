'use client';

import { useQuery } from '@tanstack/react-query';
import { platformAdminApi } from '@/lib/api';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, KpiCard, ErrorAlert, MoneyText } from '@/components/feedback';
import { RefreshCw, BadgeCent, TrendingDown, AlertCircle, Package } from 'lucide-react';

interface PackageRow {
    id: string;
    name: string;
    monthly_price: string;
}

export default function BillingReconcilePage() {
    const reconcileQuery = useQuery({
        queryKey: ['platform-admin', 'billing', 'reconcile'],
        queryFn: () => platformAdminApi.getBillingReconciliation(),
    });

    const data = reconcileQuery.data;

    const columns: DataTableColumn<PackageRow>[] = [
        {
            key: 'name',
            header: 'Package Plan Name',
            render: (row) => (
                <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{row.name}</span>
                </div>
            ),
        },
        {
            key: 'monthly_price',
            header: 'Configured Monthly Rate',
            render: (row) => <MoneyText amount={parseFloat(row.monthly_price || '0')} />,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Platform Billing & MRR Reconciliation"
                description="Cross-tenant subscription financial rollup, churn tracking, and payment failure metrics."
                action={
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reconcileQuery.refetch()}
                        disabled={reconcileQuery.isFetching}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${reconcileQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh Ledger Rollup
                    </Button>
                }
            />

            {reconcileQuery.isError && (
                <ErrorAlert
                    title="Failed to load reconciliation rollup"
                    message={String((reconcileQuery.error as Error)?.message || reconcileQuery.error)}
                />
            )}

            <div className="grid gap-4 md:grid-cols-4">
                <KpiCard
                    label="Total Platform MRR"
                    value={data?.mrr_total ? `$${parseFloat(data.mrr_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$0.00'}
                    subtext="Aggregated active subscription revenue"
                />
                <KpiCard
                    label="Active Tenant Subscriptions"
                    value={data?.active_subscriptions ?? 0}
                    subtext="Live billing accounts"
                />
                <KpiCard
                    label="30-Day Cancellations (Churn)"
                    value={data?.cancelled_last_30d ?? 0}
                    subtext="Terminated in the last 30 days"
                />
                <KpiCard
                    label="Failed Ingestion Payments"
                    value={data?.failed_payments ?? 0}
                    subtext="Unresolved gateway failures"
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Catalog Package Baseline Rates</CardTitle>
                    <CardDescription>
                        Standard monthly subscription tiers against which tenant ledgers are reconciled.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={(data?.packages || []) as PackageRow[]}
                        loading={reconcileQuery.isLoading}
                        emptyTitle="No packages configured"
                        emptyDescription="Create packages in the Packages menu to establish billing baselines."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
