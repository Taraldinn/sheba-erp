'use client';

import { useQuery } from '@/lib/query/native';
import { ticketApi, type Ticket } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantTickets() {
    const list = useQuery({ queryKey: queryKeys.tickets.list(), queryFn: () => ticketApi.list() });
    const columns: DataTableColumn<Ticket>[] = [
        { id: 'subject', header: 'Subject' },
        { id: 'customer_name', header: 'Customer' },
        { id: 'priority', header: 'Priority', cell: r => <StatusBadge status={r.priority} label={r.priority} /> },
        { id: 'status', header: 'Status', cell: r => <StatusBadge status={r.status} label={r.status} /> },
        { id: 'created_at', header: 'Opened', cell: r => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Support tickets"
                description="Customer-facing support tickets for this tenant."
            />
            {list.error && <ErrorAlert title="Failed to load tickets" error={list.error as Error} />}
            <DataTable<Ticket>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No tickets in the queue."
                testId="tickets-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
