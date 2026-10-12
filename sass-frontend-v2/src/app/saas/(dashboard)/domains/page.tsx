'use client';

import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { saasApi, type SaasDomain } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';
import { useState } from 'react';


export default function SaasDomains() {
    const canManage = useCan('tenant.provision');
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<string | undefined>();

    const domains = useQuery({ queryKey: queryKeys.saasDomains.list(), queryFn: () => saasApi.getDomains() });
    const verify = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => saasApi.verifyDomain(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saasDomains.all() }),
            },
            { success: 'Verification state updated', error: 'Could not toggle verification' },
        ),
    );

    const columns: DataTableColumn<SaasDomain>[] = [
        { id: 'domain', header: 'Domain', sortable: true },
        { id: 'tenant_name', header: 'Tenant' },
        { id: 'is_primary', header: 'Primary', cell: row => (row.is_primary ? <StatusBadge status="active" label="Primary" /> : '—') },
        { id: 'is_active', header: 'Status', cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
        { id: 'ssl_active', header: 'SSL', cell: row => (row.ssl_active ? <StatusBadge status="approved" label="Active" /> : <StatusBadge status="pending" label="Pending" />) },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row => (
                <Button size="sm" variant="outline" disabled={!canManage || verify.isPending} onClick={() => verify.mutate(row.id)}>
                    Toggle verify
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Domains"
                description="Tenant hostnames, primary flags, and verification status."
            />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by domain or tenant…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                ]}
                status={status}
                onStatusChange={setStatus}
                onRefresh={() => domains.refetch()}
                isRefreshing={domains.isFetching}
            />
            {domains.error && <ErrorAlert title="Failed to load domains" error={domains.error} />}
            <DataTable<SaasDomain>
                data={domains.data}
                columns={columns}
                isLoading={domains.isLoading}
                error={domains.error}
                emptyState="No domains yet. Tenants register their custom domain from the ISP owner portal."
                testId="saas-domains-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
