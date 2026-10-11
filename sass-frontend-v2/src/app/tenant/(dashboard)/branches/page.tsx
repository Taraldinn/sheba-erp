'use client';

import { useQuery } from '@tanstack/react-query';
import { branchApi, type Branch } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';


export default function TenantBranches() {
    const list = useQuery({ queryKey: queryKeys.branches.list(), queryFn: () => branchApi.list() });
    const columns: DataTableColumn<Branch>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'code', header: 'Code' },
        { id: 'location', header: 'Location' },
        { id: 'address', header: 'Address' },
        { id: 'total_capacity', header: 'Capacity', align: 'right' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="Branches" description="POP branches and field offices." />
            {list.error && <ErrorAlert title="Failed to load branches" error={list.error} />}
            <DataTable<Branch>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No branches yet."
                testId="branches-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
