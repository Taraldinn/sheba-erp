'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { routerApi, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspRouters() {
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.routers.list(), queryFn: () => routerApi.list() });
    const sync = useMutation({ mutationFn: (id: string) => routerApi.syncNow(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.routers.all() }) });
    const columns: DataTableColumn<Router>[] = [
        { id: 'name', header: 'Name' },
        { id: 'hostname', header: 'Hostname' },
        { id: 'ip_address', header: 'IP' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'online' ? 'default' : 'destructive'}>{s}</Badge>;
            },
        },
        { id: 'active_pppoe_count', header: 'PPPoE' },
        { id: 'last_sync_at', header: 'Last sync' },
        {
            id: 'actions',
            header: 'Actions',
            cell: (row: any) => (
                <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(row.original.id)}>Sync</Button>
            ),
        },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Routers</h1>
                <p className="text-sm text-muted-foreground">MikroTik routers across all branches.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load routers" error={list.error} />}
            <DataTable<Router>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}