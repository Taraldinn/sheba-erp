'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saasApi, type SaasBackup } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';


export default function SaasBackups() {
    const canManage = useCan('platform.manage');
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.saasBackups.list(), queryFn: () => saasApi.getBackups() });
    const create = useMutation(
        withMutationToast(
            {
                mutationFn: (tenantId: string) => saasApi.createBackup(tenantId || 'all'),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasBackups.all() }),
            },
            { success: 'Backup queued', error: 'Could not create backup' },
        ),
    );
    const columns: DataTableColumn<SaasBackup>[] = [
        { id: 'tenant_name', header: 'Tenant', sortable: true },
        { id: 'backup_type', header: 'Type' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
        { id: 'size_bytes', header: 'Size', align: 'right', cell: row => formatBytes(Number(row.size_bytes || 0)) },
        { id: 'created_at', header: 'Created' },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Backups"
                description="Tenant database and media backups."
                actions={
                    <Button disabled={!canManage || create.isPending} onClick={() => create.mutate('all')}>
                        {create.isPending ? 'Creating…' : 'Create backup'}
                    </Button>
                }
            />
            {list.error && <ErrorAlert title="Failed to load backups" error={list.error} />}
            <DataTable<SaasBackup>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No backups yet."
                testId="saas-backups-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}

function formatBytes(b: number): string {
    if (!b) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
