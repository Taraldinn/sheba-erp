'use client';

import { useQuery } from '@/lib/query/native';
import { corporateApi, type CorporateConnection } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantCorporateConnections() {
    const list = useQuery({ queryKey: queryKeys.corporate.connections(), queryFn: () => corporateApi.connections() });
    const columns: DataTableColumn<CorporateConnection>[] = [
        { id: 'customer_name', header: 'Client' },
        { id: 'service_identifier', header: 'Service' },
        { id: 'bandwidth_down', header: 'Down (Mbps)', align: 'right' },
        { id: 'bandwidth_up', header: 'Up (Mbps)', align: 'right' },
        { id: 'vlan', header: 'VLAN' },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} label={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Corporate connections"
                description="Dedicated lines to corporate customers."
            />
            {list.error && <ErrorAlert title="Failed to load connections" error={list.error as Error} />}
            <DataTable<CorporateConnection>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No dedicated connections yet."
                testId="corporate-connections-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
