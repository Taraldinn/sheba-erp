'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { useState } from 'react';
import { z } from 'zod';
import { subscriptionApi, type CustomerSubscription } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    search: z.string().optional(),
    status: z.string().optional(),
    customer: z.string().optional(),
});
export default function TenantSubscriptions() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

        const queryClient = useQueryClient();
    const canManage = useCan('subscription.manage');
    const [draftSearch, setDraftSearch] = useState(search.search ?? '');

    const params = {
        page: search.page ?? 1,
        search: search.search,
        status: search.status,
        customer: search.customer,
    };
    const list = useQuery({
        queryKey: queryKeys.subscriptions.list(params),
        queryFn: () => subscriptionApi.list(params),
        placeholderData: previous => previous,
    });
    const updateSearch = (patch: Partial<typeof search>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (patch.page === undefined) params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const activate = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => subscriptionApi.activate(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() }),
            },
            { success: 'Subscription activated', error: 'Could not activate subscription' },
        ),
    );
    const suspend = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => subscriptionApi.suspend(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() }),
            },
            { success: 'Subscription suspended', error: 'Could not suspend subscription' },
        ),
    );
    const terminate = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => subscriptionApi.terminate(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() }),
            },
            { success: 'Subscription terminated', error: 'Could not terminate subscription' },
        ),
    );

    const columns: DataTableColumn<CustomerSubscription>[] = [
        { id: 'customer_name', header: 'Customer' },
        { id: 'service_identifier', header: 'Service' },
        { id: 'package_name', header: 'Package' },
        { id: 'billing_cycle', header: 'Cycle' },
        { id: 'price', header: 'Price', align: 'right', cell: row => <MoneyText value={row.price} /> },
        { id: 'expires_at', header: 'Expires' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row =>
                canManage ? (
                    <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={activate.isPending} onClick={() => activate.mutate(row.id)}>
                            Activate
                        </Button>
                        <Button size="sm" variant="ghost" disabled={suspend.isPending} onClick={() => suspend.mutate(row.id)}>
                            Suspend
                        </Button>
                        <Button size="sm" variant="ghost" disabled={terminate.isPending} onClick={() => terminate.mutate(row.id)}>
                            Terminate
                        </Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Subscriptions"
                description="Customer service subscriptions and lifecycle."
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by service id or package…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'suspended', label: 'Suspended' },
                    { value: 'expired', label: 'Expired' },
                    { value: 'terminated', label: 'Terminated' },
                    { value: 'pending', label: 'Pending' },
                ]}
                status={search.status}
                onStatusChange={v => updateSearch({ status: v })}
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load subscriptions" error={list.error} />}
            <DataTable<CustomerSubscription>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No subscriptions match the current filters."
                page={params.page}
                pageSize={20}
                onPageChange={p => updateSearch({ page: p })}
                testId="subscriptions-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
