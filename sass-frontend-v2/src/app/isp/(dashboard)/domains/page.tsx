'use client';

import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { ispAdminApi, type IspAdminDomain } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useState } from 'react';


export default function IspDomains() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const list = useQuery({ queryKey: queryKeys.ispAdminDomains.list(), queryFn: () => ispAdminApi.listDomains() });
    const verify = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => ispAdminApi.verifyDomain(id),
                onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.ispAdminDomains.all() }),
            },
            { success: 'Verification updated', error: 'Could not verify domain' },
        ),
    );
    const columns: DataTableColumn<IspAdminDomain>[] = [
        { id: 'hostname', header: 'Hostname', sortable: true },
        { id: 'domain_type', header: 'Type' },
        { id: 'is_primary', header: 'Primary', cell: row => (row.is_primary ? <StatusBadge status="active" label="Primary" /> : '—') },
        { id: 'verified', header: 'Verified', cell: row => (row.verified ? <StatusBadge status="approved" label="Verified" /> : <StatusBadge status="pending" label="Pending" />) },
        { id: 'is_active', header: 'Status', cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} /> },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row => (
                <Button size="sm" variant="outline" disabled={verify.isPending} onClick={() => verify.mutate(row.id)}>
                    Toggle verify
                </Button>
            ),
        },
    ];
    return (
        <div className="space-y-6">
            <PageHeader title="Domains" description="Manage the hostnames this ISP tenant uses." />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by hostname…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load domains" error={list.error} />}
            <DataTable<IspAdminDomain>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                testId="isp-domains-table"
                rowKey={row => String(row.id)}
            />
        </div>
    );
}
