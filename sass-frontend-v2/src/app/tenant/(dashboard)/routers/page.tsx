'use client';

import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { routerApi, type Router } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, StatusBadge, ListToolbar } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';
import { useState } from 'react';
import Link from 'next/link';
import { Activity, Plus, Pencil } from 'lucide-react';
import { RegisterRouterModal } from './register-router-modal';


export default function TenantRouters() {
    const queryClient = useQueryClient();
    const canSync = useCan('router.sync');
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRouter, setEditingRouter] = useState<Router | null>(null);

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
        {
            id: 'name',
            header: 'Name',
            sortable: true,
            cell: row => (
                <Link
                    href={`/tenant/routers/${row.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors hover:underline inline-flex items-center gap-1.5"
                >
                    {row.name}
                </Link>
            ),
        },
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
            cell: row => (
                <div className="flex items-center justify-end gap-1.5">
                    <Button asChild size="sm" variant="outline" className="h-8 gap-1 border-primary/30 text-primary hover:bg-primary/10">
                        <Link href={`/tenant/routers/${row.id}`}>
                            <Activity className="h-3.5 w-3.5" />
                            Workspace
                        </Link>
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-muted-foreground hover:text-foreground"
                        title="Edit router configuration"
                        onClick={() => {
                            setEditingRouter(row);
                            setModalOpen(true);
                        }}
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {canSync && (
                        <>
                            <Button size="sm" variant="ghost" className="h-8" disabled={test.isPending} onClick={() => test.mutate(row.id)}>
                                Test
                            </Button>
                            <Button size="sm" variant="outline" className="h-8" disabled={sync.isPending} onClick={() => sync.mutate(row.id)}>
                                Sync now
                            </Button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Routers"
                description="MikroTik routers registered with this tenant. Credentials are stored server-side and never sent to the browser."
                action={
                    <Button
                        onClick={() => {
                            setEditingRouter(null);
                            setModalOpen(true);
                        }}
                        className="h-9 gap-1.5 bg-primary text-primary-foreground shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Add Router
                    </Button>
                }
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

            <RegisterRouterModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                routerToEdit={editingRouter}
                onSuccess={() => list.refetch()}
            />
        </div>
    );
}
