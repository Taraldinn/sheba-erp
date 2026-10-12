'use client';

import { useQuery } from '@/lib/query/native';
import { agentsApi, type VoiceTemplate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantVoiceTemplates() {
    const list = useQuery({ queryKey: queryKeys.agents.voiceTemplates(), queryFn: () => agentsApi.voiceTemplates() });
    const columns: DataTableColumn<VoiceTemplate>[] = [
        { id: 'name', header: 'Name' },
        { id: 'language', header: 'Language' },
        { id: 'body', header: 'Body' },
        { id: 'is_active', header: 'Status', cell: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Voice templates"
                description="Reusable templates for voice / SMS campaigns."
            />
            {list.error && <ErrorAlert title="Failed to load templates" error={list.error as Error} />}
            <DataTable<VoiceTemplate>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No templates yet."
                testId="voice-templates-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
