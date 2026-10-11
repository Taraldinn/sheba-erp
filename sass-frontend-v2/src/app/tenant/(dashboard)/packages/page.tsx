'use client';

import { useRouter, useSearchParams, useParams, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { packageApi, type IspPackage } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorAlert, PageHeader, ListToolbar, StatusBadge, MoneyText } from '@/components/feedback';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { withMutationToast } from '@/lib/mutation-toast';
import { useCan } from '@/lib/permissions';

const searchSchema = z.object({
    page: z.number().int().min(1).optional().catch(1),
    search: z.string().optional(),
    is_active: z.string().optional(),
});
type PackageForm = {
    name: string;
    mikrotik_profile: string;
    speed_mbps: number;
    validity_days: number;
    regular_price: number;
    description: string;
    is_active: boolean;
};

const EMPTY: PackageForm = {
    name: '',
    mikrotik_profile: '',
    speed_mbps: 5,
    validity_days: 30,
    regular_price: 0,
    description: '',
    is_active: true,
};

export default function TenantPackages() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const search: any = Object.fromEntries(searchParams.entries());
    if (search.page) search.page = parseInt(search.page, 10);
    if (search.page_size) search.page_size = parseInt(search.page_size, 10);
    if (search.customer) search.customer = parseInt(search.customer, 10);

        const queryClient = useQueryClient();
    const canManage = useCan('package.manage');
    const [draftSearch, setDraftSearch] = useState(search.search ?? '');
    const [editing, setEditing] = useState<IspPackage | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<IspPackage | null>(null);

    const params = {
        page: search.page ?? 1,
        search: search.search,
        is_active: search.is_active,
    };
    const list = useQuery({
        queryKey: queryKeys.packages.list(params),
        queryFn: () => packageApi.list(params),
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
                mutationFn: (form: PackageForm) =>
                    packageApi.create({ ...form, speed_mbps: Number(form.speed_mbps), validity_days: Number(form.validity_days), regular_price: Number(form.regular_price) }),
                onSuccess: () => {
                    setCreating(false);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package created', error: 'Could not create package' },
        ),
    );
    const update = useMutation(
        withMutationToast(
            {
                mutationFn: ({ id, form }: { id: string; form: PackageForm }) =>
                    packageApi.update(id, { ...form, speed_mbps: Number(form.speed_mbps), validity_days: Number(form.validity_days), regular_price: Number(form.regular_price) }),
                onSuccess: () => {
                    setEditing(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package updated', error: 'Could not update package' },
        ),
    );
    const remove = useMutation(
        withMutationToast(
            {
                mutationFn: (id: string) => packageApi.remove(id),
                onSuccess: () => {
                    setPendingDelete(null);
                    queryClient.invalidateQueries({ queryKey: queryKeys.packages.all() });
                },
            },
            { success: 'Package deleted', error: 'Could not delete package' },
        ),
    );

    const columns: DataTableColumn<IspPackage>[] = [
        { id: 'name', header: 'Name' },
        { id: 'mikrotik_profile', header: 'Profile' },
        { id: 'speed_mbps', header: 'Speed (Mbps)', align: 'right' },
        { id: 'validity_days', header: 'Validity (days)', align: 'right' },
        { id: 'regular_price', header: 'Price', align: 'right', cell: row => <MoneyText value={row.regular_price} /> },
        {
            id: 'is_active',
            header: 'Status',
            cell: row => <StatusBadge status={row.is_active ? 'active' : 'inactive'} label={row.is_active ? 'Active' : 'Inactive'} />,
        },
        { id: 'subscribers_count', header: 'Subscribers', align: 'right' },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: row =>
                canManage ? (
                    <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setEditing(row); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setPendingDelete(row); }}>Delete</Button>
                    </div>
                ) : null,
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Internet packages"
                description="Plans and MikroTik profiles offered by this tenant."
                actions={canManage ? <Button onClick={() => setCreating(true)}>New package</Button> : null}
            />
            <ListToolbar
                search={draftSearch}
                onSearchChange={setDraftSearch}
                onSearchSubmit={v => updateSearch({ search: v || undefined })}
                searchPlaceholder="Search by name or profile…"
                statusOptions={[
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                ]}
                status={search.is_active}
                onStatusChange={v => updateSearch({ is_active: v })}
                onRefresh={() => list.refetch()}
                isRefreshing={list.isFetching}
            />
            {list.error && <ErrorAlert title="Failed to load packages" error={list.error} />}
            <DataTable<IspPackage>
                data={list.data}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No packages yet. Add a plan to start selling subscriptions."
                testId="packages-table"
                rowKey={row => String(row.id)}
            />
            {(creating || editing) && (
                <PackageFormDialog
                    open={true}
                    initial={editing ? mapPackageToForm(editing) : EMPTY}
                    title={editing ? `Edit ${editing.name}` : 'New package'}
                    pending={create.isPending || update.isPending}
                    onOpenChange={o => {
                        if (!o) {
                            setCreating(false);
                            setEditing(null);
                        }
                    }}
                    onSubmit={form => (editing ? update.mutateAsync({ id: editing.id, form }) : create.mutateAsync(form))}
                />
            )}
            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete package"
                description={pendingDelete ? `Permanently delete "${pendingDelete.name}"? Subscribers will lose this plan.` : ''}
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
        </div>
    );
}

function mapPackageToForm(p: IspPackage): PackageForm {
    return {
        name: String(p.name ?? ''),
        mikrotik_profile: String(p.mikrotik_profile ?? ''),
        speed_mbps: Number(p.speed_mbps ?? 0),
        validity_days: Number(p.validity_days ?? 30),
        regular_price: Number(p.regular_price ?? 0),
        description: String((p as { description?: string }).description ?? ''),
        is_active: Boolean(p.is_active),
    };
}

function PackageFormDialog({
    open,
    onOpenChange,
    initial,
    title,
    pending,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    initial: PackageForm;
    title: string;
    pending: boolean;
    onSubmit: (form: PackageForm) => Promise<unknown>;
}) {
    const [form, setForm] = useState<PackageForm>(initial);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <form
                    onSubmit={e => {
                        e.preventDefault();
                        void onSubmit(form);
                    }}
                    className="space-y-3"
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Name" required>
                            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                        </Field>
                        <Field label="MikroTik profile">
                            <Input value={form.mikrotik_profile} onChange={e => setForm(f => ({ ...f, mikrotik_profile: e.target.value }))} />
                        </Field>
                        <Field label="Speed (Mbps)" required>
                            <Input type="number" min={0} value={form.speed_mbps} onChange={e => setForm(f => ({ ...f, speed_mbps: Number(e.target.value) }))} />
                        </Field>
                        <Field label="Validity (days)" required>
                            <Input type="number" min={1} value={form.validity_days} onChange={e => setForm(f => ({ ...f, validity_days: Number(e.target.value) }))} />
                        </Field>
                        <Field label="Price" required>
                            <Input type="number" min={0} step="0.01" value={form.regular_price} onChange={e => setForm(f => ({ ...f, regular_price: Number(e.target.value) }))} />
                        </Field>
                        <Field label="Active">
                            <label className="flex items-center gap-2 pt-1.5 text-sm">
                                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                                Visible to subscribers
                            </label>
                        </Field>
                    </div>
                    <Field label="Description">
                        <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Saving…' : 'Save'}
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
