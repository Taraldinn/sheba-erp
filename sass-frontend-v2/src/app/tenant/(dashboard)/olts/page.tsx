'use client';

import { useQuery } from '@/lib/query/native';
import { oltApi, type Olt } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { useState } from 'react';


export default function TenantOlts() {
    const [search, setSearch] = useState('');
    const list = useQuery({
        queryKey: queryKeys.olts.list({ search }),
        queryFn: () => oltApi.list({ search }),
    });
    const columns: DataTableColumn<Olt>[] = [
        { id: 'name', header: 'Name' },
        { id: 'vendor', header: 'Vendor' },
        { id: 'model', header: 'Model' },
        { id: 'ip_address', header: 'IP' },
        { id: 'pon_ports', header: 'PON ports', align: 'right' },
        { id: 'status', header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="OLTs" description="Optical line terminals under this tenant." />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by name or vendor…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load OLTs" error={list.error} />}
            <DataTable<Olt>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No OLTs registered."
                testId="olts-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
