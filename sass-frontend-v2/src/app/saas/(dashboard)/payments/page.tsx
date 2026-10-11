'use client';

import { useQuery } from '@tanstack/react-query';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { saasApi, type SaasPayment } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function SaasPayments() {
    const list = useQuery({ queryKey: queryKeys.saasPayments.list(), queryFn: () => saasApi.getPayments() });
    const columns: DataTableColumn<SaasPayment>[] = [
        { id: 'tenant_name', header: 'Tenant' },
        { id: 'amount', header: 'Amount' },
        { id: 'currency', header: 'Currency' },
        { id: 'payment_method', header: 'Method' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'succeeded' ? 'default' : s === 'failed' ? 'destructive' : 'secondary'}>{s}</Badge>;
            },
        },
        { id: 'created_at', header: 'Paid at', cell: (row: any) => formatDateTime(row.tenant_name as string) },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Payments</h1>
                <p className="text-sm text-muted-foreground">Tenant subscription payments.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load payments" error={list.error} />}
            <DataTable<SaasPayment> data={list.data} columns={columns} isLoading={list.isLoading} error={list.error} />
        </div>
    );
}

function formatDateTime(v: string | undefined): string {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleString();
    } catch {
        return v;
    }
}