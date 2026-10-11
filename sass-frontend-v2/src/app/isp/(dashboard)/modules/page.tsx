'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ispAdminApi, type IspAdminModule } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';


export default function IspModules() {
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.ispAdminModules.list(), queryFn: () => ispAdminApi.listModules() });
    const subs = useMutation(
        withMutationToast(
            {
                mutationFn: (key: string) => ispAdminApi.subscribeModule(key),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ispAdminModules.all() }),
            },
            { success: 'Module enabled', error: 'Could not enable module' },
        ),
    );
    const unsubs = useMutation(
        withMutationToast(
            {
                mutationFn: (key: string) => ispAdminApi.unsubscribeModule(key),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ispAdminModules.all() }),
            },
            { success: 'Module disabled', error: 'Could not disable module' },
        ),
    );

    const columns: DataTableColumn<IspAdminModule>[] = [
        { id: 'label', header: 'Module' },
        { id: 'key', header: 'Key' },
        { id: 'category', header: 'Category' },
        {
            id: 'paid',
            header: 'Tier',
            cell: row => ((row as { paid?: boolean }).paid ? <StatusBadge status="active" label="Paid" /> : <StatusBadge status="secondary" label="Free" />),
        },
        {
            id: 'enabled',
            header: 'Status',
            cell: row => ((row as { enabled?: boolean }).enabled ? <StatusBadge status="active" label="Enabled" /> : <StatusBadge status="inactive" label="Disabled" />),
        },
        {
            id: 'actions',
            header: 'Actions',
            align: 'right',
            cell: row => {
                const enabled = Boolean((row as { enabled?: boolean }).enabled);
                return (
                    <Button size="sm" variant={enabled ? 'destructive' : 'default'} disabled={subs.isPending || unsubs.isPending} onClick={() => (enabled ? unsubs : subs).mutate(row.key)}>
                        {enabled ? 'Disable' : 'Enable'}
                    </Button>
                );
            },
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="Modules" description="Feature modules available on this ISP tenant. Disabling a module hides it from child tenants immediately." />
            {list.error && <ErrorAlert title="Failed to load modules" error={list.error} />}
            <DataTable<IspAdminModule>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                testId="isp-modules-table"
                rowKey={row => row.key}
            />
        </div>
    );
}
