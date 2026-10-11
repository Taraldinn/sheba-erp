'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformAdminApi, type PlatformImpersonationSession } from '@/lib/api';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { PageHeader, StatusBadge, ErrorAlert } from '@/components/feedback';
import { toast } from 'sonner';
import { UserCheck, ShieldAlert, StopCircle, RefreshCw } from 'lucide-react';

export default function ImpersonationLogPage() {
    const queryClient = useQueryClient();
    const [activeOnly, setActiveOnly] = useState(false);

    const logsQuery = useQuery({
        queryKey: ['platform-admin', 'impersonation-log', { active: activeOnly }],
        queryFn: () => platformAdminApi.getImpersonationLogs({ active: activeOnly }),
        refetchInterval: 10000,
    });

    const stopMutation = useMutation({
        mutationFn: async (tenantSlugOrId: string) => {
            return platformAdminApi.stopImpersonation(tenantSlugOrId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['platform-admin', 'impersonation-log'] });
            toast.success('Active impersonation session successfully terminated');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to stop impersonation. OWNER role required.');
        },
    });

    const columns: DataTableColumn<PlatformImpersonationSession>[] = [
        {
            key: 'actor',
            header: 'Operator (Admin)',
            render: (row) => (
                <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{row.actor}</span>
                </div>
            ),
        },
        {
            key: 'tenant',
            header: 'Target Tenant',
            render: (row) => (
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {row.tenant}
                </span>
            ),
        },
        {
            key: 'started_at',
            header: 'Started At',
            render: (row) => (
                <span className="text-xs text-muted-foreground">
                    {new Date(row.started_at).toLocaleString()}
                </span>
            ),
        },
        {
            key: 'is_active',
            header: 'Session Status',
            render: (row) => (
                <StatusBadge
                    status={row.is_active ? 'warning' : 'neutral'}
                    label={row.is_active ? 'ACTIVE IMPERSONATION' : 'ENDED'}
                />
            ),
        },
        {
            key: 'reason',
            header: 'Operator Stated Reason',
            render: (row) => (
                <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">
                    {row.reason || 'No justification provided'}
                </span>
            ),
        },
        {
            key: 'force_stopped_by',
            header: 'Terminated By',
            render: (row) => (
                <span className="text-xs text-muted-foreground">
                    {row.force_stopped_by ? `Force-stopped by ${row.force_stopped_by}` : (row.ended_at ? 'Natural expiration / logout' : '—')}
                </span>
            ),
        },
        {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (
                row.is_active ? (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => stopMutation.mutate(row.tenant)}
                        disabled={stopMutation.isPending}
                    >
                        <StopCircle className="mr-1.5 h-3.5 w-3.5" />
                        Force Stop
                    </Button>
                ) : null
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Tenant Impersonation Audit Log"
                description="Immutable audit trail of operator tenant takeovers with emergency session kill affordances."
                action={
                    <div className="flex items-center gap-2">
                        <Button
                            variant={activeOnly ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setActiveOnly(!activeOnly)}
                        >
                            {activeOnly ? 'Show All History' : 'Filter Active Only'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => logsQuery.refetch()}
                            disabled={logsQuery.isFetching}
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>
                }
            />

            {logsQuery.isError && (
                <ErrorAlert
                    title="Failed to load impersonation records"
                    message={String((logsQuery.error as Error)?.message || logsQuery.error)}
                />
            )}

            <DataTable
                columns={columns}
                data={logsQuery.data || []}
                loading={logsQuery.isLoading}
                emptyTitle="No impersonation records found"
                emptyDescription={activeOnly ? "There are currently no active operator impersonation sessions." : "No impersonation events have been recorded."}
            />
        </div>
    );
}
