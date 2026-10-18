'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@/lib/query/native';
import { useState } from 'react';
import { z } from 'zod';
import { customerApi, type Customer, type CustomerCreatePayload } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { UserPlus, X } from 'lucide-react';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    page_size: z.number().int().min(1).max(100).optional().catch(20),
    search: z.string().optional(),
    status: z.string().optional(),
    billing_type: z.string().optional(),
    has_due: z.string().optional(),
});
export default function CustomersList() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

    const queryClient = useQueryClient();
    const canCreate = useCan('customer.create');
    const canDelete = useCan('customer.delete');
    const [draftSearch, setDraftSearch] = useState(search.search ?? '');
    const [showCreate, setShowCreate] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

    const params = {
        page: search.page ?? 1,
        page_size: search.page_size ?? 20,
        search: search.search,
        status: search.status,
        billing_type: search.billing_type,
        has_due: search.has_due,
    };
    const customers = useQuery({
        queryKey: queryKeys.customers.list(params),
        queryFn: () => customerApi.list(params),
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

    const create = useMutation(
        withMutationToast(
            {
                mutationFn: (payload: CustomerCreatePayload) => customerApi.create(payload),
                onSuccess: () => {
                    setShowCreate(false);
                    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
                },
            },
            { success: 'Customer created', error: 'Could not create customer' },
        ),
    );

    const remove = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => customerApi.remove(id),
                onSuccess: () => {
                    setPendingDelete(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.customers.all() });
                },
            },
            { success: 'Customer deleted', error: 'Could not delete customer' },
        ),
    );

    const columns: DataTableColumn<Customer>[] = [
        { id: 'customer_code', header: 'Code' },
        { id: 'full_name', header: 'Name' },
        { id: 'mobile', header: 'Mobile' },
        { id: 'pppoe_username', header: 'PPPoE' },
        { id: 'package_name', header: 'Package' },
        {
            id: 'status',
            header: 'Status',
            cell: row => <StatusBadge status={row.status} />,
        },
        {
            id: 'monthly_bill',
            header: 'Monthly',
            align: 'right',
            cell: row => <MoneyText value={row.monthly_bill} />,
        },
        {
            id: 'due_amount',
            header: 'Due',
            align: 'right',
            cell: row => <MoneyText value={row.due_amount} />,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row => (
                <div className="flex items-center justify-end gap-1">
                    {canDelete && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={e => {
                                e.stopPropagation();
                                setPendingDelete(row);
                            }}
                        >
                            Delete
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Customers"
                description="Subscribers in this tenant."
                actions={
                    canCreate ? (
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                                Quick Add
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => router.push('/tenant/customers/new')}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                            >
                                <UserPlus className="size-4" />
                                Add New Client
                            </Button>
                        </div>
                    ) : null
                }
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by name, mobile, code…"
                statusOptions={[
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'INACTIVE', label: 'Inactive' },
                    { value: 'SUSPENDED', label: 'Suspended' },
                    { value: 'EXPIRED', label: 'Expired' },
                    { value: 'PROMISE', label: 'Promise Active' },
                    { value: 'TERMINATED', label: 'Left Clients' },
                ]}
                status={search.status}
                onStatusChange={v => updateSearch({ status: v })}
                onRefresh={() => customers.refetch()}
                isRefreshing={customers.isFetching}
            />
            {(search.status || search.billing_type || search.has_due) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-muted-foreground font-medium">Active Filters:</span>
                    {search.status && (
                        <Badge variant="secondary" className="gap-1 font-mono">
                            Status: {search.status}
                            <button onClick={() => updateSearch({ status: undefined })} className="hover:text-foreground">
                                <X className="size-3" />
                            </button>
                        </Badge>
                    )}
                    {search.billing_type && (
                        <Badge variant="secondary" className="gap-1 font-mono">
                            Billing: {search.billing_type}
                            <button onClick={() => updateSearch({ billing_type: undefined })} className="hover:text-foreground">
                                <X className="size-3" />
                            </button>
                        </Badge>
                    )}
                    {search.has_due && (
                        <Badge variant="secondary" className="gap-1 font-mono">
                            Due Clients
                            <button onClick={() => updateSearch({ has_due: undefined })} className="hover:text-foreground">
                                <X className="size-3" />
                            </button>
                        </Badge>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => updateSearch({ status: undefined, billing_type: undefined, has_due: undefined })}
                    >
                        Reset filters
                    </Button>
                </div>
            )}
            {customers.error && <ErrorAlert title="Failed to load customers" error={customers.error} />}
            <DataTable<Customer>
                data={customers.data}
                columns={columns}
                isLoading={customers.isLoading}
                error={customers.error}
                onRowClick={row => router.push(`/tenant/customers/${row.id}`)}
                emptyState="No customers match the current filters."
                page={params.page}
                pageSize={params.page_size}
                onPageChange={p => updateSearch({ page: p })}
                testId="customers-table"
                rowKey={row => String(row.id)}
            />
            <CreateCustomerDialog
                open={showCreate}
                onOpenChange={o => !o && setShowCreate(false)}
                onSubmit={payload => create.mutateAsync(payload)}
                pending={create.isPending}
            />
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete customer"
                description={pendingDelete ? `Permanently delete ${pendingDelete.full_name}? This cannot be undone.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
        </div>
    );
}

function CreateCustomerDialog({
    open,
    onOpenChange,
    onSubmit,
    pending,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onSubmit: (payload: CustomerCreatePayload) => Promise<unknown>;
    pending: boolean;
}) {
    const [form, setForm] = useState<CustomerCreatePayload>({
        full_name: '',
        mobile: '',
        email: '',
        address: '',
        area_zone: '',
        pppoe_username: '',
        connection_type: 'PPPoE',
    });
    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        void onSubmit(form);
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New customer</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Full name" required>
                            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
                        </Field>
                        <Field label="Mobile" required>
                            <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} required />
                        </Field>
                        <Field label="Email">
                            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                        </Field>
                        <Field label="PPPoE username">
                            <Input value={form.pppoe_username ?? ''} onChange={e => setForm(f => ({ ...f, pppoe_username: e.target.value }))} />
                        </Field>
                        <Field label="Area / zone">
                            <Input value={form.area_zone ?? ''} onChange={e => setForm(f => ({ ...f, area_zone: e.target.value }))} />
                        </Field>
                        <Field label="Connection type">
                            <select
                                value={form.connection_type ?? 'PPPoE'}
                                onChange={e => setForm(f => ({ ...f, connection_type: e.target.value as any }))}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <option value="PPPoE">PPPoE</option>
                                <option value="Static_IP">Static IP</option>
                                <option value="DHCP">DHCP / IPoE</option>
                            </select>
                        </Field>
                    </div>
                    <Field label="Address">
                        <Textarea value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Creating…' : 'Create customer'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">
                {label} {required && <span className="text-destructive">*</span>}
            </Label>
            {children}
        </div>
    );
}
