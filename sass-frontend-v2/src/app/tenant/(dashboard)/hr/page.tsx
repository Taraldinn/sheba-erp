'use client';

import { useQuery } from '@/lib/query/native';
import { hrApi, type Employee } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantEmployees() {
    const list = useQuery({ queryKey: queryKeys.hr.employees(), queryFn: () => hrApi.employees() });
    const columns: DataTableColumn<Employee>[] = [
        { id: 'full_name', header: 'Name' },
        { id: 'employee_code', header: 'Code' },
        { id: 'department', header: 'Department' },
        { id: 'designation', header: 'Designation' },
        { id: 'email', header: 'Email' },
        { id: 'phone', header: 'Phone' },
        { id: 'is_active', header: 'Status', cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} label={r.is_active ? 'Active' : 'Inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="HR — Employees"
                description="Office staff, field technicians and back-office."
            />
            {list.error && <ErrorAlert title="Failed to load employees" error={list.error as Error} />}
            <DataTable<Employee>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No employees on record."
                testId="hr-employees-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
