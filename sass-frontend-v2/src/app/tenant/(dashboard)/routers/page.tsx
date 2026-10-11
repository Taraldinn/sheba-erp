'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routerApi, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, StatusBadge, ListToolbar } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';
import { useState } from 'react';


export default function TenantRouters() {
    const queryClient = useQueryClient();
    const canSync = useCan('router.sync');
    const [search, setSearch] = useState('');

    const list = useQuery({
        queryKey: queryKeys.routers.list({ search }),
        queryFn: () => routerApi.list({ search }),
    });
    const sync = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => routerApi.syncNow(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routers.all() }),
            },
            { success: 'Sync queued', error: 'Could not start sync' },
        ),
    );
    const test = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => routerApi.test(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routers.all() }),
            },
            { success: 'Connection OK', error: 'Connection failed' },
        ),
    );

    const columns: DataTableColumn<Router>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'hostname', header: 'Hostname' },
        { id: 'ip_address', header: 'IP' },
        { id: 'model', header: 'Model' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
        { id: 'active_pppoe_count', header: 'PPPoE sessions', align: 'right' },
        { id: 'last_sync_at', header: 'Last sync' },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row =>
                canSync ? (
                    <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => test.mutate(row.id)}>
                            Test
                        </Button>
                        <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(row.id)}>
                            Sync now
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Routers"
                description="MikroTik routers registered with this tenant. Credentials are stored server-side and never sent to the browser."
            />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by name or hostname…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load routers" error={list.error} />}
            <DataTable<Router>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No routers yet. Register a MikroTik device to start provisioning subscribers."
                testId="routers-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
