'use client';

import { useQuery } from '@/lib/query/native';
import { onuApi, type Onu } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantONUs() {
    const list = useQuery({ queryKey: queryKeys.tenant(), queryFn: () => onuApi.list({ page_size: 200 }) });
    const columns: DataTableColumn<Onu>[] = [
        { id: 'serial_number', header: 'Serial', cell: r => r.serial_number || '—' },
        { id: 'mac_address', header: 'MAC', cell: r => r.mac_address || '—' },
        { id: 'olt_name', header: 'OLT', cell: r => r.olt_name || '—' },
        {
            id: 'pon_port',
            header: 'PON port',
            cell: r => r.pon_port != null ? `${r.pon_port}` : '—',
        },
        {
            id: 'rx_signal_dbm',
            header: 'RX (dBm)',
            cell: r => r.rx_signal_dbm != null ? `${r.rx_signal_dbm}` : '—',
        },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} />,
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="ONUs"
                description="CPE devices on the GPON / EPON network."
            />
            {list.error && <ErrorAlert title="Failed to load ONUs" error={list.error as Error} />}
            <DataTable<Onu>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No ONUs have been discovered yet."
                testId="onus-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
