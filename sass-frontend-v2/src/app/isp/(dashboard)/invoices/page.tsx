'use client';

import { useQuery } from '@tanstack/react-query';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { invoiceApi, type Invoice } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspInvoices() {
    const list = useQuery({ queryKey: queryKeys.invoices.list(), queryFn: () => invoiceApi.list() });
    const columns: DataTableColumn<Invoice>[] = [
        { id: 'invoice_no', header: 'Invoice' },
        { id: 'customer_name', header: 'Customer' },
        { id: 'billing_month', header: 'Month' },
        { id: 'total_payable', header: 'Total' },
        { id: 'paid_amount', header: 'Paid' },
        { id: 'due_amount', header: 'Due' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toUpperCase();
                return <Badge variant={s === 'PAID' ? 'default' : s === 'UNPAID' ? 'destructive' : 'secondary'}>{s}</Badge>;
            },
        },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Invoices</h1>
                <p className="text-sm text-muted-foreground">Customer invoices across the ISP.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load invoices" error={list.error} />}
            <DataTable<Invoice> data={list.data} columns={columns} isLoading={list.isLoading} error={list.error} />
        </div>
    );
}