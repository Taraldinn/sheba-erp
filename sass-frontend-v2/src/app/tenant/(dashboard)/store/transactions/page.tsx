'use client';

import { useQuery } from '@/lib/query/native';
import { storeApi, type StockTransaction } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantStoreTransactions() {
    const list = useQuery({ queryKey: queryKeys.store.transactions(), queryFn: () => storeApi.transactions() });
    const columns: DataTableColumn<StockTransaction>[] = [
        { id: 'created_at', header: 'When', cell: r => r.created_at ? new Date(r.created_at).toLocaleString() : '—' },
        { id: 'item_name', header: 'Item' },
        { id: 'direction', header: 'In/Out', cell: r => r.direction === 'in' ? '↓ In' : '↑ Out' },
        { id: 'quantity', header: 'Qty', align: 'right' },
        { id: 'reason', header: 'Reason' },
        { id: 'reference', header: 'Reference' },
    ];
    return (
        <div className="space-y-6">
            <PageHeader
                title="Stock movements"
                description="Every in / out transaction against the store."
            />
            {list.error && <ErrorAlert title="Failed to load stock transactions" error={list.error as Error} />}
            <DataTable<StockTransaction>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No stock movements yet."
                testId="store-transactions-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
