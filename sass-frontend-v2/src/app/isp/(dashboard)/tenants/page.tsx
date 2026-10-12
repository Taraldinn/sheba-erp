'use client';

import { useQuery } from '@/lib/query/native';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { tenantApi, type IspAdminTenant } from '@/lib/api';
import { DataTable } from '@/components/data-table/data-table';
import { Badge } from '@/components/ui/badge';
import { ErrorAlert } from '@/components/feedback/feedback';


export default function IspTenants() {
    const my = useQuery({ queryKey: ['isp', 'my-tenants'], queryFn: () => tenantApi.myTenants() });
    const columns: DataTableColumn<IspAdminTenant>[] = [
        { id: 'name', header: 'Name' },
        { id: 'slug', header: 'Slug' },
        { id: 'role', header: 'Role' },
        { id: 'plan', header: 'Plan' },
        { id: 'contact_email', header: 'Email' },
        {
            id: 'is_active',
            header: 'Status',
            cell: (row: any) => {
                const v = Boolean(row.id);
                return <Badge variant={v ? 'default' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge>;
            },
        },
        { id: 'tenant_url', header: 'URL', cell: (row: any) => <a className="text-primary underline-offset-2 hover:underline" href={row.name as string} target="_blank" rel="noreferrer">open</a> },
    ];
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">My tenants</h1>
                <p className="text-sm text-muted-foreground">Tenants you administer on this ISP workspace.</p>
            </header>
            {my.error && <ErrorAlert title="Failed to load tenants" error={my.error} />}
            <DataTable<IspAdminTenant>
                data={my.data?.items}
                columns={columns}
                isLoading={my.isLoading}
                error={my.error}
                rowKey={row => String(row.id)}
            />
        </div>
    );
}