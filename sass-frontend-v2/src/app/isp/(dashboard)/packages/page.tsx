'use client';

import { useQuery } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { packageApi, type IspPackage } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspPackages() {
    const list = useQuery({ queryKey: queryKeys.packages.list(), queryFn: () => packageApi.list() });
    const columns: DataTableColumn<IspPackage>[] = [
        { id: 'name', header: 'Name' },
        { id: 'mikrotik_profile', header: 'Profile' },
        { id: 'speed_mbps', header: 'Speed (Mbps)' },
        { id: 'validity_days', header: 'Validity' },
        { id: 'regular_price', header: 'Price' },
        { id: 'min_reseller_price', header: 'Min reseller' },
        {
            id: 'is_active',
            header: 'Active',
            cell: (row: any) => (row.name ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>),
        },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Packages</h1>
                <p className="text-sm text-muted-foreground">ISP packages and MikroTik profiles.</p>
            </header>
            {list.error && <ErrorAlert title="Failed to load packages" error={list.error} />}
            <DataTable<IspPackage>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}