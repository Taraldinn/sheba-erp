'use client';

import { useQuery } from '@tanstack/react-query';
import { saasApi, type SaasPackage } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';
import { useState } from 'react';


export default function SaasPackages() {
    const [search, setSearch] = useState('');
    const list = useQuery({
        queryKey: queryKeys.saasPackages.list(),
        queryFn: () => saasApi.getPackages(),
    });
    const columns: DataTableColumn<SaasPackage>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'price', header: 'Price', align: 'right', cell: row => <MoneyText value={row.price} currency={row.currency} /> },
        { id: 'currency', header: 'Currency' },
        { id: 'billing_interval', header: 'Interval' },
        { id: 'is_active', header: 'Status', cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
        { id: 'subscriber_count', header: 'Subscribers', align: 'right' },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="SaaS packages" description="Subscription plans offered to ISP tenants." />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by name…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load packages" error={list.error} />}
            <DataTable<SaasPackage>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No SaaS packages yet."
                testId="saas-packages-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
