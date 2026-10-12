'use client';

import { useQuery } from '@/lib/query/native';
import { agentsApi, type AgentPbxMapping } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantAgents() {
    const list = useQuery({ queryKey: queryKeys.agents.mappings(), queryFn: () => agentsApi.mappings() });
    const columns: DataTableColumn<AgentPbxMapping>[] = [
        { id: 'agent_id', header: 'Agent ID' },
        { id: 'staff_name', header: 'Staff' },
        { id: 'extension', header: 'Extension' },
        { id: 'pbx_extension', header: 'PBX ext.' },
        {
            id: 'last_call_at',
            header: 'Last call',
            cell: r => r.last_call_at ? new Date(r.last_call_at).toLocaleString() : '—',
        },
        {
            id: 'is_active',
            header: 'Status',
            cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Callcenter agents"
                description="Agents mapped to the MikoPBX / callcenter extension."
            />
            {list.error && <ErrorAlert title="Failed to load agents" error={list.error as Error} />}
            <DataTable<AgentPbxMapping>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No agent mappings yet — invite a staff member first."
                testId="agents-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
