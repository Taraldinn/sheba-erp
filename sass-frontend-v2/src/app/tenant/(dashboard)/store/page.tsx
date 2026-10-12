'use client';

import { useQuery } from '@/lib/query/native';
import { storeApi, type StoreItem } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';

export default function TenantStore() {
    const list = useQuery({ queryKey: queryKeys.store.items(), queryFn: () => storeApi.items() });
    const columns: DataTableColumn<StoreItem>[] = [
        { id: 'name', header: 'Name' },
        { id: 'item_code', header: 'Code' },
        { id: 'category', header: 'Category' },
        { id: 'unit', header: 'Unit' },
        {
            id: 'unit_price',
            header: 'Price',
            align: 'right',
            cell: r => String(r.unit_price),
        },
        {
            id: 'stock_quantity',
            header: 'Stock',
            align: 'right',
            cell: r => r.stock_quantity != null ? String(r.stock_quantity) : '—',
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
                title="Store & devices"
                description="ONUs, routers, cables, fiber patch cords — anything you keep in the store room."
            />
            {list.error && <ErrorAlert title="Failed to load store items" error={list.error as Error} />}
            <DataTable<StoreItem>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No items in the store yet."
                testId="store-items-table"
                rowKey={r => r.id}
            />
        </div>
    );
}
