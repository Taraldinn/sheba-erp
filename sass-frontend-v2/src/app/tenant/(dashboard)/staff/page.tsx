'use client';

import { useQuery } from '@/lib/query/native';
import { staffApi, type OfficeStaffMember } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantOfficeStaff() {
    const list = useQuery({ queryKey: queryKeys.staff.list(), queryFn: () => staffApi.list() });
    const columns: DataTableColumn<OfficeStaffMember>[] = [
        {
            id: 'name',
            header: 'Name',
            cell: r => [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username || r.email || '—',
        },
        { id: 'email', header: 'Email' },
        { id: 'phone', header: 'Phone' },
        { id: 'role_display', header: 'Role' },
        {
            id: 'last_login',
            header: 'Last login',
            cell: r => r.last_login ? new Date(r.last_login).toLocaleString() : '—',
        },
        { id: 'is_active', header: 'Status', cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Office staff"
                description="Internal users with login access to this tenant."
            />
            {list.error && <ErrorAlert title="Failed to load staff" error={list.error as Error} />}
            <DataTable<OfficeStaffMember>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No office staff accounts yet."
                testId="office-staff-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
