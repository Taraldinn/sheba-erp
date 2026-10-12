'use client';

import { useQuery } from '@/lib/query/native';
import { corporateApi, type CorporateVLAN } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantCorporateVLANs() {
    const list = useQuery({ queryKey: queryKeys.corporate.vlans(), queryFn: () => corporateApi.vlans() });
    const columns: DataTableColumn<CorporateVLAN>[] = [
        { id: 'vlan_id', header: 'VLAN ID', align: 'right' },
        { id: 'name', header: 'Name' },
        { id: 'customer_name', header: 'Customer' },
        { id: 'description', header: 'Description' },
        { id: 'is_active', header: 'Status', cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="VLANs"
                description="Customer VLANs on the corporate backbone."
            />
            {list.error && <ErrorAlert title="Failed to load VLANs" error={list.error as Error} />}
            <DataTable<CorporateVLAN>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No VLANs configured."
                testId="corporate-vlans-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
