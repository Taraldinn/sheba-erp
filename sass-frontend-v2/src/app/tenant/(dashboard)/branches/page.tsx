'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@/lib/query/native';
import { branchesApi, type Branch } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { DataTable, type DataTableColumn } from '@/components/data-table/data-table';
import { ErrorAlert, PageHeader, StatusBadge } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/feedback/confirm';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface ZoneForm {
    name: string;
    code: string;
    location: string;
    in_charge: string;
    contact: string;
    total_capacity: number;
    status: string;
}

const EMPTY_ZONE_FORM: ZoneForm = {
    name: '',
    code: '',
    location: '',
    in_charge: '',
    contact: '',
    total_capacity: 1000,
    status: 'Active',
};

export default function TenantBranches() {
    const list = useQuery({ queryKey: queryKeys.branches.list(), queryFn: () => branchesApi.list() });
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<Branch | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Branch | null>(null);

    const create = useMutation({
        mutationFn: (data: Partial<Branch>) => branchesApi.create(data),
        onSuccess: () => {
            list.refetch();
            setCreating(false);
            toast.success('Zone created successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to create zone');
        },
    });

    const update = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<Branch> }) => branchesApi.update(id, data),
        onSuccess: () => {
            list.refetch();
            setEditing(null);
            toast.success('Zone updated successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to update zone');
        },
    });

    const remove = useMutation({
        mutationFn: (id: string) => branchesApi.remove(id),
        onSuccess: () => {
            list.refetch();
            setPendingDelete(null);
            toast.success('Zone deleted successfully');
        },
        onError: (err: any) => {
            toast.error(err?.message || 'Failed to delete zone');
        },
    });

    const columns: DataTableColumn<Branch>[] = [
        {
            id: 'name',
            header: 'Zone / POP Name',
            sortable: true,
            cell: r => (
                <div className="flex flex-col">
                    <span className="font-semibold text-foreground">{r.name}</span>
                    {r.code && <span className="font-mono text-xs text-muted-foreground">{r.code}</span>}
                </div>
            ),
        },
        {
            id: 'location',
            header: 'Location',
            cell: r => (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span>{r.location || '—'}</span>
                </div>
            ),
        },
        {
            id: 'in_charge',
            header: 'In-Charge & Contact',
            cell: r => (
                <div className="flex flex-col text-xs">
                    <span className="font-medium text-foreground">{r.in_charge || '—'}</span>
                    <span className="text-muted-foreground">{r.contact || ''}</span>
                </div>
            ),
        },
        {
            id: 'total_capacity',
            header: 'Capacity',
            align: 'right',
            cell: r => <span className="font-mono text-xs tabular-nums">{(r.total_capacity ?? 1000).toLocaleString()} lines</span>,
        },
        {
            id: 'status',
            header: 'Status',
            cell: r => <StatusBadge status={r.status} />,
        },
        {
            id: 'actions',
            header: '',
            align: 'right',
            cell: r => (
                <div className="flex items-center justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={e => {
                            e.stopPropagation();
                            setEditing(r);
                        }}
                        title="Edit Zone"
                    >
                        <Pencil className="size-3.5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={e => {
                            e.stopPropagation();
                            setPendingDelete(r);
                        }}
                        title="Delete Zone"
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title="Zones & POP Branches"
                description="Manage operational distribution zones, physical POPs, and coverage sectors."
                actions={
                    <Button onClick={() => setCreating(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Add Zone
                    </Button>
                }
            />

            {list.error && <ErrorAlert title="Failed to load zones" error={list.error as Error} />}

            <DataTable<Branch>
                data={list.data ?? []}
                columns={columns}
                isLoading={list.isLoading}
                error={list.error}
                emptyState="No distribution zones configured yet. Click 'Add Zone' to create one."
                testId="branches-table"
                rowKey={r => r.id}
            />

            {(creating || editing) && (
                <ZoneFormDialog
                    open={Boolean(creating || editing)}
                    onOpenChange={o => {
                        if (!o) {
                            setCreating(false);
                            setEditing(null);
                        }
                    }}
                    title={editing ? `Edit Zone: ${editing.name}` : 'Add Distribution Zone'}
                    initial={
                        editing
                            ? {
                                  name: editing.name,
                                  code: editing.code || '',
                                  location: editing.location || '',
                                  in_charge: editing.in_charge || '',
                                  contact: editing.contact || '',
                                  total_capacity: editing.total_capacity ?? 1000,
                                  status: editing.status || 'Active',
                              }
                            : EMPTY_ZONE_FORM
                    }
                    pending={create.isPending || update.isPending}
                    onSubmit={async form => {
                        if (editing) {
                            await update.mutateAsync({ id: editing.id, data: form });
                        } else {
                            await create.mutateAsync(form);
                        }
                    }}
                />
            )}

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                onOpenChange={o => !o && setPendingDelete(null)}
                title="Delete Distribution Zone"
                description={
                    pendingDelete
                        ? `Are you sure you want to permanently delete "${pendingDelete.name}"? This may affect linked TJ boxes and subscribers.`
                        : ''
                }
                confirmLabel="Delete Zone"
                destructive
                onConfirm={async () => {
                    if (pendingDelete) await remove.mutateAsync(pendingDelete.id);
                }}
            />
        </div>
    );
}

function ZoneFormDialog({
    open,
    onOpenChange,
    title,
    initial,
    pending,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    title: string;
    initial: ZoneForm;
    pending: boolean;
    onSubmit: (form: ZoneForm) => Promise<unknown>;
}) {
    const [form, setForm] = useState<ZoneForm>(initial);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            toast.error('Zone Name is required.');
            return;
        }
        await onSubmit(form);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="zone-name">Zone / POP Name *</Label>
                        <Input
                            id="zone-name"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g. Uttara Sector 3 Main Hub"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-code">Zone Code</Label>
                            <Input
                                id="zone-code"
                                value={form.code}
                                onChange={e => setForm({ ...form, code: e.target.value })}
                                placeholder="e.g. ZN-UT-01"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-capacity">Capacity (Lines)</Label>
                            <Input
                                id="zone-capacity"
                                type="number"
                                min={1}
                                value={form.total_capacity}
                                onChange={e => setForm({ ...form, total_capacity: Number(e.target.value) || 1000 })}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="zone-location">Location / Address</Label>
                        <Input
                            id="zone-location"
                            value={form.location}
                            onChange={e => setForm({ ...form, location: e.target.value })}
                            placeholder="e.g. Road 12, Sector 3, Uttara, Dhaka"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-in-charge">In-Charge Officer</Label>
                            <Input
                                id="zone-in-charge"
                                value={form.in_charge}
                                onChange={e => setForm({ ...form, in_charge: e.target.value })}
                                placeholder="e.g. Engr. Tanvir Ahmed"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="zone-contact">Contact Phone</Label>
                            <Input
                                id="zone-contact"
                                value={form.contact}
                                onChange={e => setForm({ ...form, contact: e.target.value })}
                                placeholder="e.g. 01712345678"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="zone-status">Status</Label>
                        <Select value={form.status} onValueChange={status => setForm({ ...form, status })}>
                            <SelectTrigger id="zone-status">
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Decommissioned">Decommissioned / Inactive</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Saving…' : 'Save Zone'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
