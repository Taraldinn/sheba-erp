'use client';

import { useQuery } from '@/lib/query/native';
import { saasApi, type SaasEmployee } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { useState } from 'react';


export default function SaasEmployees() {
    const [search, setSearch] = useState('');
    const list = useQuery({
        queryKey: queryKeys.saasEmployees.list(),
        queryFn: () => saasApi.getEmployees(),
    });
    const columns: DataTableColumn<SaasEmployee>[] = [
        { id: 'full_name', header: 'Name', sortable: true },
        { id: 'email', header: 'Email' },
        { id: 'phone', header: 'Phone' },
        { id: 'role', header: 'Role' },
        { id: 'department', header: 'Department' },
        { id: 'tenant_name', header: 'Tenant' },
        { id: 'is_active', header: 'Status', cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="Employees" description="Platform employees, roles, and tenant assignments." />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by name, email, role…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load employees" error={list.error} />}
            <DataTable<SaasEmployee>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No employees yet."
                testId="saas-employees-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
