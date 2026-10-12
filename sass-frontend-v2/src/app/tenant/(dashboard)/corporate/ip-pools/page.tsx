'use client';

import { useQuery } from '@/lib/query/native';
import { corporateApi, type CorporateIPPool } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantCorporateIPPools() {
    const list = useQuery({ queryKey: queryKeys.corporate.ipPools(), queryFn: () => corporateApi.ipPools() });
    const columns: DataTableColumn<CorporateIPPool>[] = [
        { id: 'name', header: 'Pool' },
        { id: 'cidr', header: 'CIDR' },
        { id: 'gateway', header: 'Gateway' },
        { id: 'vlan', header: 'VLAN' },
        { id: 'total_addresses', header: 'Total', align: 'right' },
        { id: 'used_addresses', header: 'Used', align: 'right' },
        { id: 'is_active', header: 'Status', cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Corporate IP pools"
                description="Routable subnets allocated to corporate customers."
            />
            {list.error && <ErrorAlert title="Failed to load IP pools" error={list.error as Error} />}
            <DataTable<CorporateIPPool>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No IP pools configured."
                testId="corporate-ip-pools-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
