'use client';

import { useQuery } from '@/lib/query/native';
import { hrApi, type AttendanceRecord } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantAttendance() {
    const list = useQuery({ queryKey: queryKeys.hr.attendance(), queryFn: () => hrApi.attendance() });
    const columns: DataTableColumn<AttendanceRecord>[] = [
        { id: 'date', header: 'Date' },
        { id: 'employee_name', header: 'Employee' },
        { id: 'check_in', header: 'Check-in' },
        { id: 'check_out', header: 'Check-out' },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} label={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="HR — Attendance"
                description="Daily attendance log for every employee."
            />
            {list.error && <ErrorAlert title="Failed to load attendance" error={list.error as Error} />}
            <DataTable<AttendanceRecord>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No attendance has been recorded yet."
                testId="hr-attendance-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
