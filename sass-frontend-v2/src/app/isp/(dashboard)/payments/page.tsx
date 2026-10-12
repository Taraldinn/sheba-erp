'use client';

import { useQuery } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { paymentApi, type PaymentTransaction } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspPayments() {
    const list = useQuery({ queryKey: queryKeys.payments.list(), queryFn: () => paymentApi.list() });
    const columns: DataTableColumn<PaymentTransaction>[] = [
        { id: 'customer_name', header: 'Customer' },
        { id: 'amount', header: 'Amount' },
        { id: 'payment_method', header: 'Method' },
        { id: 'trx_id', header: 'Trx ID' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s.includes('success') || s === 'completed' ? 'default' : s === 'failed' ? 'destructive' : 'secondary'}>{s}</Badge>;
            },
        },
        { id: 'created_at', header: 'When' },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Payments</h1>
                <p className="text-sm text-muted-foreground">Customer payment transactions.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load payments" error={list.error} />}
            <DataTable<PaymentTransaction>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}