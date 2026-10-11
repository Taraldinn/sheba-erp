'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { invoiceApi, type Invoice } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    search: z.string().optional(),
    status: z.string().optional(),
    month: z.string().optional(),
});
export default function TenantInvoices() {
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
        month: search.month,
    };
    const list = useQuery({
        queryKey: queryKeys.invoices.list(params),
        queryFn: () => invoiceApi.list(params),
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

    const columns: DataTableColumn<Invoice>[] = [
        { id: 'invoice_no', header: 'Invoice', sortable: true },
        { id: 'customer_name', header: 'Customer' },
        { id: 'billing_month', header: 'Month' },
        { id: 'package_amount', header: 'Package', align: 'right', cell: row => <MoneyText value={row.package_amount} /> },
        { id: 'discount', header: 'Discount', align: 'right', cell: row => <MoneyText value={row.discount} /> },
        { id: 'total_payable', header: 'Total', align: 'right', cell: row => <MoneyText value={row.total_payable} /> },
        { id: 'paid_amount', header: 'Paid', align: 'right', cell: row => <MoneyText value={row.paid_amount} /> },
        { id: 'due_amount', header: 'Due', align: 'right', cell: row => <MoneyText value={row.due_amount} /> },
        {
            id: 'status',
            header: 'Status',
            cell: row => <StatusBadge status={row.status} />,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Invoices"
                description="Monthly invoices, discounts, and balances."
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by invoice no, customer…"
                statusOptions={[
                    { value: 'PAID', label: 'Paid' },
                    { value: 'UNPAID', label: 'Unpaid' },
                    { value: 'PARTIAL', label: 'Partially paid' },
                    { value: 'OVERDUE', label: 'Overdue' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                ]}
                status={search.status}
                onStatusChange={v => updateSearch({ status: v })}
                extra={
                    <input
                        type="month"
                        value={search.month ?? ''}
                        onChange={e => updateSearch({ month: e.target.value || undefined })}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        aria-label="Filter by billing month"
                    />
                }
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load invoices" error={list.error} />}
            <DataTable<Invoice>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No invoices match the current filters."
                page={params.page}
                pageSize={20}
                onPageChange={p => updateSearch({ page: p })}
                testId="invoices-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
