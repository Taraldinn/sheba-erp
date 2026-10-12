'use client';

import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { subscriptionApi, type CustomerSubscription } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspSubscriptions() {
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: queryKeys.subscriptions.list(), queryFn: () => subscriptionApi.list() });
    const suspend = useMutation({ mutationFn: (id: string) => subscriptionApi.suspend(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() }) });
    const activate = useMutation({ mutationFn: (id: string) => subscriptionApi.activate(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() }) });
    const columns: DataTableColumn<CustomerSubscription>[] = [
        { id: 'customer_name', header: 'Customer' },
        { id: 'service_identifier', header: 'Service' },
        { id: 'package_name', header: 'Package' },
        { id: 'billing_cycle', header: 'Cycle' },
        { id: 'price', header: 'Price' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'active' ? 'default' : 'secondary'}>{s}</Badge>;
            },
        },
        {
            id: 'actions',
            header: 'Actions',
            cell: (row: any) => (
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={activate.isPending} onClick={() => activate.mutate(row.original.id)}>Activate</Button>
                    <Button size="sm" variant="destructive" disabled={suspend.isPending} onClick={() => suspend.mutate(row.original.id)}>Suspend</Button>
                </div>
            ),
        },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Subscriptions</h1>
                <p className="text-sm text-muted-foreground">All customer subscriptions across the ISP.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load subscriptions" error={list.error} />}
            <DataTable<CustomerSubscription>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}