'use client';

import { useQuery } from '@/lib/query/native';
import { saasApi, type SaasAuditLog } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { useState } from 'react';


import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { platformAdminApi } from '@/lib/api';

export default function SaasAudit() {
    const [search, setSearch] = useState('');
    const list = useQuery({
        queryKey: queryKeys.saasAuditLogs.list(),
        queryFn: () => saasApi.getAuditLogs(),
    });

    const handleExport = (format: 'csv' | 'ndjson') => {
        const url = platformAdminApi.getAuditExportUrl({ format, action: search || undefined });
        window.open(url, '_blank');
    };

    const columns: DataTableColumn<SaasAuditLog>[] = [
        { id: 'action', header: 'Action', sortable: true },
        { id: 'user_id', header: 'User' },
        { id: 'tenant_id', header: 'Tenant' },
        { id: 'ip_address', header: 'IP' },
        { id: 'created_at', header: 'When', cell: row => formatDateTime(row.created_at) },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Audit logs"
                description="Append-only audit trail for platform activity."
                action={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('csv')}
                        >
                            <Download className="mr-1.5 h-4 w-4" />
                            Export CSV
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('ndjson')}
                        >
                            <Download className="mr-1.5 h-4 w-4" />
                            Export JSONL
                        </Button>
                    </div>
                }
            />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by action, user, ip…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load audit logs" error={list.error} />}
            <DataTable<SaasAuditLog>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No audit entries match the current filters."
                testId="saas-audit-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}

function formatDateTime(v: string | undefined): string {
    if (!v) return '—';
    try {
        return new Date(v).toLocaleString();
    } catch {
        return v;
    }
}
