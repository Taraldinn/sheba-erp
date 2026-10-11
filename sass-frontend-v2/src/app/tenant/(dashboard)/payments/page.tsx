'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { paymentApi, type PaymentTransaction } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    search: z.string().optional(),
    status: z.string().optional(),
    method: z.string().optional(),
});
export default function TenantPayments() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

        const [draftSearch, setDraftSearch] = useState(search.search ?? '');

    const params = {
        page: search.page ?? 1,
        search: search.search,
        status: search.status,
        payment_method: search.method,
    };
    const list = useQuery({
        queryKey: queryKeys.payments.list(params),
        queryFn: () => paymentApi.list(params),
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

    const columns: DataTableColumn<PaymentTransaction>[] = [
        { id: 'customer_name', header: 'Customer' },
        { id: 'amount', header: 'Amount', align: 'right', cell: row => <MoneyText value={row.amount} /> },
        { id: 'payment_method', header: 'Method' },
        { id: 'gateway', header: 'Gateway' },
        { id: 'trx_id', header: 'Trx ID' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
        { id: 'created_at', header: 'When' },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Payments"
                description="Customer payment transactions and gateway records. Idempotency keys protect against duplicate submissions."
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by customer or trx id…"
                statusOptions={[
                    { value: 'succeeded', label: 'Succeeded' },
                    { value: 'pending', label: 'Pending' },
                    { value: 'failed', label: 'Failed' },
                    { value: 'refunded', label: 'Refunded' },
                    { value: 'reversed', label: 'Reversed' },
                    { value: 'disputed', label: 'Disputed' },
                ]}
                status={search.status}
                onStatusChange={v => updateSearch({ status: v })}
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load payments" error={list.error} />}
            <DataTable<PaymentTransaction>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No payment transactions yet."
                page={params.page}
                pageSize={20}
                onPageChange={p => updateSearch({ page: p })}
                testId="payments-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
