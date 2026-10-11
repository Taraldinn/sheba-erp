'use client';

import { useQuery } from '@tanstack/react-query';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { saasApi, type SaasSubscription } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function SaasSubscriptions() {
    const list = useQuery({ queryKey: queryKeys.saasSubscriptions.list(), queryFn: () => saasApi.getSubscriptions() });
    const columns: DataTableColumn<SaasSubscription>[] = [
        { id: 'tenant_name', header: 'Tenant' },
        { id: 'package_name', header: 'Package' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'active' ? 'default' : 'secondary'}>{s}</Badge>;
            },
        },
        { id: 'current_period_end', header: 'Renews', cell: (row: any) => formatDate(row.current_period_end as string) },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Subscriptions</h1>
                <p className="text-sm text-muted-foreground">Tenant SaaS subscription status and renewal dates.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load subscriptions" error={list.error} />}
            <DataTable<SaasSubscription>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}

function formatDate(v: string | undefined): string {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleDateString();
    } catch {
        return v;
    }
}