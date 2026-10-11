'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { DataTableColumn } from '@/components/data-table/data-table';
import { z } from 'zod';
import { customerApi, type Customer, type CustomerCreatePayload } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable } from '@/components/data-table/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ErrorAlert } from '@/components/feedback/feedback';
import { useCan } from '@/lib/permissions';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    page_size: z.number().int().min(1).max(100).optional().catch(20),
    search: z.string().optional(),
});
export default function IspCustomers() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

        const canCreate = useCan('customer.create');
    const [draftSearch, setDraftSearch] = useState(search.search ?? '');
    const [showCreate, setShowCreate] = useState(false);
    const queryClient = useQueryClient();

    const customers = useQuery({
        queryKey: queryKeys.customers.list(search),
        queryFn: () => customerApi.list(search),
        placeholderData: previous => previous,
    });

    const updateSearch = (patch: Partial<typeof search>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(patch).forEach(([k, v]) => {
            if (v === undefined || v === null || v === '') params.delete(k);
            else params.set(k, String(v));
        });
        if (patch.page === undefined) params.set('page', '1');
        router.push(`${pathname}?${params.toString()}`);
    };

    const columns: DataTableColumn<Customer>[] = [
        { id: 'customer_code', header: 'Code' },
        { id: 'full_name', header: 'Name' },
        { id: 'mobile', header: 'Mobile' },
        { id: 'pppoe_username', header: 'PPPoE' },
        { id: 'package_name', header: 'Package' },
        {
            id: 'status',
            header: 'Status',
            cell: (row: any) => {
                const s = String(row.id ?? '').toLowerCase();
                return <Badge variant={s === 'active' ? 'default' : 'secondary'}>{s || '—'}</Badge>;
            },
        },
        { id: 'monthly_bill', header: 'Monthly' },
        { id: 'due_amount', header: 'Due' },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">Customers</h1>
                    <p className="text-sm text-muted-foreground">Subscribers across all your tenants.</p>
                </div>
                {canCreate && <Button onClick={() => setShowCreate(true)}>New customer</Button>}
            </header>
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    placeholder="Search…"
                    value={draftSearch}
                    onChange={e => setDraftSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateSearch({ search: draftSearch || undefined })}
                />
                <Button variant="outline" onClick={() => updateSearch({ search: draftSearch || undefined })}>Search</Button>
            </div>
            {customers.error && <ErrorAlert title="Failed to load customers" error={customers.error} />}
            <DataTable<Customer>
                data={customers.data}
                columns={columns}
                isLoading={customers.isLoading}
                error={customers.error}
                rowKey={row => String(row.id)}
            />
            <CreateCustomerDialog
                open={showCreate}
                onOpenChange={setShowCreate}
                onCreated={async () => {
                    setShowCreate(false);
                    await queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
                }}
            />
        </div>
    );
}

function CreateCustomerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => Promise<void> | void }) {
    const [form, setForm] = useState<CustomerCreatePayload>({ full_name: '', mobile: '', pppoe_username: '' });
    const create = useMutation({ mutationFn: () => customerApi.create(form), onSuccess: () => onCreated() });
    const update = (k: keyof CustomerCreatePayload, v: string) => setForm(f => ({ ...f, [k]: v }));
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>New customer</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2"><Label>Full name</Label><Input value={form.full_name} onChange={e => update('full_name', e.target.value)} required /></div>
                    <div className="space-y-1.5"><Label>Mobile</Label><Input value={form.mobile} onChange={e => update('mobile', e.target.value)} required /></div>
                    <div className="space-y-1.5"><Label>PPPoE username</Label><Input value={form.pppoe_username} onChange={e => update('pppoe_username', e.target.value)} required /></div>
                    <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label><Textarea value={form.address ?? ''} onChange={e => update('address', e.target.value)} /></div>
                </div>
                {create.error && <ErrorAlert title="Failed to create customer" error={create.error} />}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={create.isPending || !form.full_name || !form.mobile || !form.pppoe_username} onClick={() => create.mutate()}>
                        {create.isPending ? 'Creating…' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}