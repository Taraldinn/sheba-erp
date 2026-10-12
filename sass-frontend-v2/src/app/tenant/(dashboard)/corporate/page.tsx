'use client';

import { useQuery } from '@/lib/query/native';
import { corporateApi, type CorporateCustomer } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantCorporate() {
    const list = useQuery({ queryKey: queryKeys.corporate.customers(), queryFn: () => corporateApi.customers() });
    const columns: DataTableColumn<CorporateCustomer>[] = [
        { id: 'name', header: 'Client' },
        { id: 'code', header: 'Code' },
        { id: 'industry', header: 'Industry' },
        { id: 'contact_name', header: 'Contact' },
        { id: 'contact_email', header: 'Email' },
        { id: 'contact_phone', header: 'Phone' },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} label={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Corporate clients"
                description="B2B clients, contracts and dedicated connections."
            />
            {list.error && <ErrorAlert title="Failed to load corporate clients" error={list.error as Error} />}
            <DataTable<CorporateCustomer>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No corporate clients on board yet."
                testId="corporate-customers-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
