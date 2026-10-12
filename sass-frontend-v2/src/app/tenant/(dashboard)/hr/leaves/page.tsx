'use client';

import { useQuery } from '@/lib/query/native';
import { hrApi, type LeaveRequest } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantLeaves() {
    const list = useQuery({ queryKey: queryKeys.hr.leaves(), queryFn: () => hrApi.leaves() });
    const columns: DataTableColumn<LeaveRequest>[] = [
        { id: 'employee_name', header: 'Employee' },
        { id: 'leave_type', header: 'Type' },
        { id: 'start_date', header: 'From' },
        { id: 'end_date', header: 'To' },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} label={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="HR — Leave requests"
                description="Casual, sick, and other leave applications."
            />
            {list.error && <ErrorAlert title="Failed to load leave requests" error={list.error as Error} />}
            <DataTable<LeaveRequest>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No leave requests filed."
                testId="hr-leaves-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
