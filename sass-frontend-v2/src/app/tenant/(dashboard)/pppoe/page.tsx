'use client';

import { useQuery } from '@/lib/query/native';
import { pppoeAccountApi, type PPPoEAccount } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantPPPoE() {
    const list = useQuery({ queryKey: queryKeys.pppoeAccounts.list(), queryFn: () => pppoeAccountApi.list() });
    const columns: DataTableColumn<PPPoEAccount>[] = [
        { id: 'username', header: 'Username' },
        { id: 'customer_name', header: 'Customer', cell: r => r.customer_name || '—' },
        { id: 'profile', header: 'Profile' },
        { id: 'ip_address', header: 'IP address', cell: r => r.ip_address || '—' },
        {
            id: 'last_seen',
            header: 'Last seen',
            cell: r => r.last_seen ? new Date(r.last_seen).toLocaleString() : '—',
        },
        { id: 'status', header: 'Status', cell: r => <StatusBadge status={r.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="PPPoE accounts"
                description="PPPoE credentials on the platform's MikroTik / gateway."
            />
            {list.error && <ErrorAlert title="Failed to load PPPoE accounts" error={list.error as Error} />}
            <DataTable<PPPoEAccount>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No PPPoE accounts have been provisioned."
                testId="pppoe-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
