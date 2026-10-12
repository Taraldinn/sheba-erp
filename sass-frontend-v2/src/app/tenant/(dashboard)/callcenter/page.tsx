'use client';

import { useQuery } from '@/lib/query/native';
import { agentsApi, type CallLog } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantCalls() {
    const list = useQuery({ queryKey: queryKeys.agents.callLogs(), queryFn: () => agentsApi.callLogs() });
    const columns: DataTableColumn<CallLog>[] = [
        { id: 'created_at', header: 'When', cell: r => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
        { id: 'agent_name', header: 'Agent' },
        { id: 'direction', header: 'Dir.' },
        { id: 'customer_number', header: 'Number' },
        { id: 'duration_seconds', header: 'Duration', align: 'right', cell: r => r.duration_seconds != null ? `${r.duration_seconds}s` : '—' },
        { id: 'status', header: 'Status', cell: r => <StatusBadge status={r.status} label={r.status} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Call logs"
                description="Every inbound and outbound call handled by the callcenter."
            />
            {list.error && <ErrorAlert title="Failed to load call logs" error={list.error as Error} />}
            <DataTable<CallLog>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No calls have been logged yet."
                testId="callcenter-calls-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
