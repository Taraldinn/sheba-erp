'use client';

import { useQuery } from '@/lib/query/native';
import { branchesApi, type Branch } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantBranches() {
    const list = useQuery({ queryKey: queryKeys.branches.list(), queryFn: () => branchesApi.list() });
    const columns: DataTableColumn<Branch>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'code', header: 'Code' },
        { id: 'location', header: 'Location' },
        { id: 'total_capacity', header: 'Capacity', align: 'right' },
        { id: 'status', header: 'Status', cell: r => <StatusBadge status={r.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="POP / Branches"
                description="Physical POPs, branch offices and field offices that this tenant operates."
            />
            {list.error && <ErrorAlert title="Failed to load branches" error={list.error as Error} />}
            <DataTable<Branch>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No POPs / branches configured yet. Add one from the configuration page."
                testId="branches-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
