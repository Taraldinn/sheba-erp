'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { useState } from 'react';
import { z } from 'zod';
import { ispAdminApi, type IspAdminChildTenant, type IspAdminChildTenantCreatePayload } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge } from '@/components/feedback';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';

const searchSchema = z.object({ page: z.number().int().min(1).optional().catch(1) });
export default function IspChildTenants() {
    const router = useRouter();
    const canCreate = useCan('tenant.provision');
    const queryClient = useQueryClient();
        const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const list = useQuery({
        queryKey: queryKeys.ispAdminChildTenants.list(),
        queryFn: () => ispAdminApi.listChildTenants(),
    });

    const columns: DataTableColumn<IspAdminChildTenant>[] = [
        { id: 'name', header: 'Name', sortable: true },
        { id: 'slug', header: 'Slug' },
        { id: 'plan', header: 'Plan' },
        { id: 'subscription_status', header: 'Status', cell: row => <StatusBadge status={row.subscription_status} /> },
        { id: 'max_subscribers', header: 'Max subs', align: 'right' },
        { id: 'customer_count', header: 'Customers', align: 'right' },
        { id: 'domain_count', header: 'Domains', align: 'right' },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Child tenants"
                description="Provisioned child tenants under this ISP."
                actions={canCreate ? <Button onClick={() => setShowCreate(true)}>New child tenant</Button> : null}
            />
            <ListToolbar
                search={search}
                onSearchChange={setSearch}
                onSearchSubmit={setSearch}
                searchPlaceholder="Search by name or slug…"
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load child tenants" error={list.error} />}
            <DataTable<IspAdminChildTenant>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                onRowClick={row => router.push(`/isp/child-tenants/$id`.replace('$id', row.id ))}
                testId="isp-child-tenants-table"
                rowKey={row => String(row.id)}
            />
            <CreateChildDialog
                open={showCreate}
                onOpenChange={setShowCreate}
                onCreated={async () => {
                    setShowCreate(false);
                    await queryClient.invalidateQueries({ queryKey: queryKeys.ispAdminChildTenants.all() });
                }}
            />
        </div>
    );
}

function CreateChildDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => Promise<void> | void }) {
    const [form, setForm] = useState<IspAdminChildTenantCreatePayload>({ name: '', slug: '', admin_username: '', admin_password: '' });
    const create = useMutation(
        withMutationToast(
            {
                mutationFn: () => ispAdminApi.createChildTenant(form),
                onSuccess: () => onCreated(),
            },
            { success: 'Child tenant provisioned', error: 'Could not provision child tenant' },
        ),
    );
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Provision child tenant</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label>Name</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Slug</Label>
                        <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Domain (optional)</Label>
                        <Input value={form.domain ?? ''} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Admin username</Label>
                        <Input value={form.admin_username} onChange={e => setForm(f => ({ ...f, admin_username: e.target.value }))} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Admin password</Label>
                        <Input type="password" value={form.admin_password} onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} required />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        disabled={create.isPending || !form.name || !form.slug || !form.admin_username || !form.admin_password}
                        onClick={() => create.mutate()}
                    >
                        {create.isPending ? 'Provisioning…' : 'Provision'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
