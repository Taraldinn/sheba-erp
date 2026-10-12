'use client';

import { useQuery } from '@/lib/query/native';
import { hrApi, type PayrollRecord } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantPayroll() {
    const list = useQuery({ queryKey: queryKeys.hr.payroll(), queryFn: () => hrApi.payroll() });
    const columns: DataTableColumn<PayrollRecord>[] = [
        { id: 'employee_name', header: 'Employee' },
        { id: 'month', header: 'Month' },
        {
            id: 'basic_salary',
            header: 'Basic',
            align: 'right',
            cell: r => String(r.basic_salary),
        },
        {
            id: 'net_salary',
            header: 'Net',
            align: 'right',
            cell: r => String(r.net_salary),
        },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} label={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="HR — Payroll"
                description="Monthly salary records and payment status."
            />
            {list.error && <ErrorAlert title="Failed to load payroll" error={list.error as Error} />}
            <DataTable<PayrollRecord>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No payroll records yet."
                testId="hr-payroll-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
