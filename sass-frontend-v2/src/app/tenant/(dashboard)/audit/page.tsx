'use client';

import { useQuery } from '@/lib/query/native';
import { auditApi, type AuditLogEntry } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader } from '@/components/feedback';

export default function TenantAudit() {
    const list = useQuery({ queryKey: queryKeys.audit.list(), queryFn: () => auditApi.list() });
    const columns: DataTableColumn<AuditLogEntry>[] = [
        { id: 'created_at', header: 'When', cell: r => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
        { id: 'actor_username', header: 'Actor' },
        { id: 'module', header: 'Module' },
        { id: 'action', header: 'Action' },
        { id: 'resource_type', header: 'Resource' },
        { id: 'ip_address', header: 'IP' },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Audit log"
                description="Every action taken inside this tenant."
            />
            {list.error && <ErrorAlert title="Failed to load audit log" error={list.error as Error} />}
            <DataTable<AuditLogEntry>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="Audit log is empty."
                testId="audit-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
